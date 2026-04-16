"""
LLM Service — Phase 3

Providers (in priority order):
1. OpenRouter  — primary (Qwen3.5-27B or Qwen3.5-397B-A17B, user-selectable)
2. Groq        — fallback (llama-3.3-70b-versatile, free tier)
3. Ollama      — local fallback (gemma3:4b)

Fixes:
- OpenRouter integration with Qwen3.5 models
- User-selectable model (primary=27B, secondary=397B)
- <think> tag stripping for Qwen3.5 thinking mode output
- Pattern-aware prompts (Phase 3)
- Trajectory-aware prompts (Phase 3)
- PII stripped from all prompts
- Fully async (httpx)
"""

import json
import re
import time
import logging
from typing import Optional

import httpx

from app.config import settings
from app.services.constraint_solver import SolverResult
from app.services.insights_service import (
    build_pattern_focus_line,
    summarize_patterns_for_prompt,
    trajectory_prompt_snapshot,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# Provider endpoints
# ─────────────────────────────────────────────────────────────
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
GROQ_API_URL       = "https://api.groq.com/openai/v1/chat/completions"
OLLAMA_API_URL     = "http://localhost:11434/api/generate"

# ─────────────────────────────────────────────────────────────
# Model identifiers
# ─────────────────────────────────────────────────────────────
# Primary — fast, efficient (user default)
QWEN_PRIMARY   = "qwen/qwen3.5-27b"
# Secondary — flagship, more powerful (user opt-in)
QWEN_SECONDARY = "qwen/qwen3.5-397b-a17b"
# Groq fallback
GROQ_MODEL     = "llama-3.3-70b-versatile"
# Local fallback
OLLAMA_MODEL   = "gemma3:4b"


# ─────────────────────────────────────────────────────────────
# Prompt builder
# ─────────────────────────────────────────────────────────────

def build_schedule_prompt(
    solver_result: SolverResult,
    goal_title: str,
    goal_type: str,
    goal_metadata: dict,
    chronotype: str,
    self_reported_failure: Optional[str],
    days_until_deadline: int,
    active_patterns=None,
    trajectory=None,
) -> str:
    """
    Build LLM prompt for daily schedule enrichment.
    Fix #17 — removed dead user_name and motivation parameters (PII stripped).
    Includes pattern context and trajectory snapshot (Phase 3).
    """
    tasks_summary = "\n".join([
        f"- {t.scheduled_start}-{t.scheduled_end}: {t.title} "
        f"({t.duration_mins} mins, {t.energy_required} energy, priority {t.priority})"
        for t in solver_result.scheduled_tasks
    ])

    unscheduled_summary = ""
    if solver_result.unscheduled_tasks:
        unscheduled_summary = "Parked tasks (couldn't fit today): " + ", ".join(
            t.title for t in solver_result.unscheduled_tasks
        )

    pattern_summary  = summarize_patterns_for_prompt(active_patterns or [])
    pattern_focus    = build_pattern_focus_line(active_patterns or [])
    trajectory_snap  = trajectory_prompt_snapshot(trajectory)

    prompt = f"""You are a productivity coach for a student.

GOAL CONTEXT:
- Goal: {goal_title} ({days_until_deadline} days remaining)
- Goal type: {goal_type}
- Chronotype: {chronotype}
- Failure pattern: {self_reported_failure or 'not specified'}

TODAY'S SCHEDULE (determined by scheduling algorithm — not negotiable):
Day type: {solver_result.day_type}
{tasks_summary}

{unscheduled_summary}

Solver context: {solver_result.strategy_hint}

ACTIVE BEHAVIOUR PATTERNS:
{pattern_summary}

TRAJECTORY:
{trajectory_snap}

Priority coaching angle:
{pattern_focus or "No special pattern focus today."}

Your output:
1. "strategy_note" — 2-3 sentences explaining today's order. Direct, no fluff.
   Reference the priority coaching angle if it exists.
2. "task_descriptions" — 1 concrete sentence per task with specific guidance.
3. "day_type_reason" — 1 sentence explaining why this day type was chosen.

Return ONLY valid JSON, no markdown, no preamble:
{{
  "strategy_note": "...",
  "task_descriptions": {{
    "task title here": "specific guidance",
    ...
  }},
  "day_type_reason": "..."
}}"""

    return prompt


# ─────────────────────────────────────────────────────────────
# Public call entrypoint
# ─────────────────────────────────────────────────────────────

async def call_llm(
    prompt: str,
    groq_api_key: Optional[str] = None,
    preferred_model: str = "primary",
    user_id=None,
    db=None,
    endpoint: str = "schedule_generate",
) -> Optional[dict]:
    """
    Call LLM with priority chain + usage tracking.
    1. OpenRouter (Qwen3.5)
    2. Groq (llama-3.3-70b)
    3. Ollama local (gemma3:4b)
    Never raises — always returns dict or None.
    """
    openrouter_key = settings.OPENROUTER_API_KEY
    if openrouter_key:
        model = QWEN_SECONDARY if preferred_model == "secondary" else QWEN_PRIMARY
        start = time.monotonic()
        result, usage = await _call_openrouter(prompt, openrouter_key, model)
        latency = int((time.monotonic() - start) * 1000)
        if result:
            await _log_llm_usage(user_id, db, endpoint, model, "openrouter", usage, latency, True)
            return result
        if usage:
            await _log_llm_usage(user_id, db, endpoint, model, "openrouter", usage, latency, False, "No result")

    # Groq fallback
    groq_key = groq_api_key or settings.GROQ_API_KEY
    if groq_key:
        start = time.monotonic()
        result, usage = await _call_groq(prompt, groq_key)
        latency = int((time.monotonic() - start) * 1000)
        if result:
            await _log_llm_usage(user_id, db, endpoint, GROQ_MODEL, "groq", usage, latency, True)
            return result

    # Local Ollama fallback
    start = time.monotonic()
    result, usage = await _call_ollama(prompt)
    latency = int((time.monotonic() - start) * 1000)
    if result:
        await _log_llm_usage(user_id, db, endpoint, OLLAMA_MODEL, "ollama", usage, latency, True)
    return result


# ─────────────────────────────────────────────────────────────
# Provider implementations
# ─────────────────────────────────────────────────────────────

async def _call_openrouter(
    prompt: str,
    api_key: str,
    model: str,
) -> tuple[Optional[dict], dict]:
    """
    Call OpenRouter API with Qwen3.5.
    Returns (result_dict, usage_dict) tuple.
    """
    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                OPENROUTER_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://momentum-app.local",
                    "X-Title": "Momentum Scheduler",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1500,
                    "temperature": 0.3,
                },
            )
            response.raise_for_status()
            data = response.json()
            usage = data.get("usage", usage)
            content = data["choices"][0]["message"]["content"]
            content = _strip_think_tags(content)
            return _parse_llm_json(content), usage
    except Exception as e:
        logger.warning("openrouter_call_failed", extra={"error": str(e)})
        return None, usage


async def _call_groq(prompt: str, api_key: str) -> tuple[Optional[dict], dict]:
    """Groq API call — fast free fallback."""
    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                GROQ_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": GROQ_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1000,
                    "temperature": 0.3,
                },
            )
            response.raise_for_status()
            data = response.json()
            usage = data.get("usage", usage)
            content = data["choices"][0]["message"]["content"]
            return _parse_llm_json(content), usage
    except Exception as e:
        logger.warning("groq_call_failed", extra={"error": str(e)})
        return None, usage


async def _call_ollama(prompt: str) -> tuple[Optional[dict], dict]:
    """Local Ollama fallback."""
    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                OLLAMA_API_URL,
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                },
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("response", "")
            # Ollama provides token counts differently
            usage = {
                "prompt_tokens": data.get("prompt_eval_count", 0),
                "completion_tokens": data.get("eval_count", 0),
                "total_tokens": data.get("prompt_eval_count", 0) + data.get("eval_count", 0),
            }
            return _parse_llm_json(content), usage
    except Exception as e:
        logger.warning("ollama_call_failed", extra={"error": str(e)})
        return None, usage


async def _log_llm_usage(
    user_id, db, endpoint: str, model: str, provider: str,
    usage: dict, latency_ms: int, success: bool, error_msg: str = None,
) -> None:
    """Log LLM usage to database for cost tracking."""
    if not user_id or not db:
        return
    try:
        from app.models.goal import LLMUsageLog
        log = LLMUsageLog(
            user_id=user_id,
            endpoint=endpoint,
            model_used=model,
            provider=provider,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
            latency_ms=latency_ms,
            success=success,
            error_message=error_msg,
        )
        db.add(log)
        await db.flush()
    except Exception:
        logger.exception("LLM execution logging failed")  # Never fail the main flow for logging


# ─────────────────────────────────────────────────────────────
# Parsing helpers
# ─────────────────────────────────────────────────────────────

def _strip_think_tags(content: str) -> str:
    """
    Fix — Strip Qwen3.5 thinking mode output.
    Qwen3.5 wraps internal reasoning in <think>...</think> before the JSON.
    We discard the thinking and keep only the final output.
    """
    if not content:
        return content
    # Remove <think>...</think> blocks (including multiline)
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
    return content.strip()


def _parse_llm_json(content: str) -> Optional[dict]:
    """Safely parse LLM response as JSON. Handles markdown fences."""
    if not content:
        return None
    # Strip markdown fences
    content = re.sub(r"```json\s*", "", content)
    content = re.sub(r"```\s*", "", content)
    content = content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        # Try to extract JSON object from within text
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                return None
    return None


# ─────────────────────────────────────────────────────────────
# Fallback enrichment (no LLM available)
# ─────────────────────────────────────────────────────────────

def build_fallback_enrichment(
    solver_result: SolverResult,
    goal_title: str,
    days_until_deadline: int,
    active_patterns=None,
    trajectory=None,
) -> dict:
    """Fallback enrichment when all LLM providers fail."""
    day_type         = solver_result.day_type
    pattern_focus    = build_pattern_focus_line(active_patterns or [])
    trajectory_nudge = getattr(trajectory, "motivational_nudge", None)

    strategy_notes = {
        "standard": (
            f"Highest-priority tasks scheduled during your peak energy window. "
            f"{days_until_deadline} days left — stay consistent."
        ),
        "stretch":        "High energy today — pushing slightly harder. Build on this momentum.",
        "minimum_viable": "Low energy day. Only Core tasks scheduled. Finishing even one is a win.",
        "recovery":       "Recovery day — lighter load. Consistency over intensity.",
        "compressed":     "Compressed schedule today. Focus on what matters most.",
    }

    desc_map = {
        "deep_study":   "Focus fully — no phone, close tabs. One concept at a time.",
        "practice":     "Solve without looking at answers first. Note what you struggled with.",
        "light_review": "Test yourself rather than re-reading. Active recall only.",
        "exercise":     "Commit fully. Track your reps/sets/time.",
        "break":        "Step away. Walk, stretch, or rest your eyes.",
        "admin":        "Keep it brief and focused.",
        "revision":     "Connect concepts. Look for patterns across topics.",
    }

    task_descriptions = {}
    for task in solver_result.scheduled_tasks:
        task_descriptions[task.title] = desc_map.get(
            task.task_type, "Stay focused and give it your best."
        )

    # Prepend pattern focus to first task description
    if pattern_focus and solver_result.scheduled_tasks:
        first = solver_result.scheduled_tasks[0]
        task_descriptions[first.title] = (
            f"Start here first. {task_descriptions[first.title]}"
        )

    day_type_reasons = {
        "standard":       "Normal scheduled day based on your profile.",
        "stretch":        "High energy + great yesterday — pushed slightly harder.",
        "minimum_viable": "Exhausted or rough yesterday — 50% capacity to protect momentum.",
        "recovery":       "Recovery mode — rebuilding consistency after a hard stretch.",
        "compressed":     "Unexpected event reduced available time today.",
    }

    strategy_parts = [
        part for part in (
            pattern_focus,
            strategy_notes.get(day_type, strategy_notes["standard"]),
            trajectory_nudge,
        )
        if part
    ]

    return {
        "strategy_note":     " ".join(strategy_parts),
        "task_descriptions": task_descriptions,
        "day_type_reason":   day_type_reasons.get(day_type, ""),
    }
