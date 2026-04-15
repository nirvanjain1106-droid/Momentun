"""Tests for LLM service — parsing, stripping, prompts, fallbacks."""

import pytest
import httpx
from unittest.mock import AsyncMock, patch

from app.services.llm_service import (
    _strip_think_tags,
    _parse_llm_json,
    build_schedule_prompt,
    build_fallback_enrichment,
    _call_openrouter,
    _call_groq,
    call_llm,
)
from app.services.constraint_solver import SolverResult, ScheduledTask


def _make_solver_result(**overrides):
    defaults = dict(
        day_of_week=2,
        day_type="standard",
        free_windows=[],
        total_free_mins=480,
        total_usable_mins=360,
        scheduled_tasks=[
            ScheduledTask(
                title="Math — Deep Study",
                task_type="deep_study",
                scheduled_start="09:00",
                scheduled_end="10:30",
                duration_mins=90,
                energy_required="high",
                priority=1,
                is_mvp_task=True,
                sequence_order=0,
            ),
        ],
        unscheduled_tasks=[],
        day_capacity_hrs=4.0,
        strategy_hint="Standard day.",
    )
    defaults.update(overrides)
    return SolverResult(**defaults)


# ── _strip_think_tags ────────────────────────────────────────


def test_strip_think_tags_removes_block():
    content = '<think>internal reasoning</think>{"key": "value"}'
    assert _strip_think_tags(content) == '{"key": "value"}'


def test_strip_think_tags_handles_multiline():
    content = '<think>\nlong\nreasoning\nhere\n</think>\n{"result": true}'
    result = _strip_think_tags(content)
    assert "<think>" not in result
    assert '{"result": true}' in result


def test_strip_think_tags_no_tags():
    content = '{"already": "clean"}'
    assert _strip_think_tags(content) == content


def test_strip_think_tags_empty():
    assert _strip_think_tags("") == ""
    assert _strip_think_tags(None) is None


# ── _parse_llm_json ──────────────────────────────────────────


def test_parse_clean_json():
    result = _parse_llm_json('{"strategy_note": "test"}')
    assert result == {"strategy_note": "test"}


def test_parse_markdown_fenced_json():
    result = _parse_llm_json('```json\n{"key": "value"}\n```')
    assert result == {"key": "value"}


def test_parse_embedded_json():
    result = _parse_llm_json('Some preamble text {"key": "value"} some suffix')
    assert result == {"key": "value"}


def test_parse_invalid_json():
    assert _parse_llm_json("not json at all") is None


def test_parse_empty():
    assert _parse_llm_json("") is None
    assert _parse_llm_json(None) is None


# ── build_schedule_prompt ────────────────────────────────────


def test_prompt_contains_required_sections():
    solver_result = _make_solver_result()
    prompt = build_schedule_prompt(
        solver_result=solver_result,
        goal_title="Math Exam",
        goal_type="exam",
        goal_metadata={"subjects": ["math"]},
        chronotype="intermediate",
        self_reported_failure="procrastination",
        days_until_deadline=30,
    )
    assert "Math Exam" in prompt
    assert "exam" in prompt
    assert "intermediate" in prompt
    assert "procrastination" in prompt
    assert "strategy_note" in prompt
    assert "task_descriptions" in prompt
    assert "day_type_reason" in prompt


def test_prompt_does_not_contain_pii():
    solver_result = _make_solver_result()
    prompt = build_schedule_prompt(
        solver_result=solver_result,
        goal_title="Goal",
        goal_type="exam",
        goal_metadata={},
        chronotype="early_bird",
        self_reported_failure=None,
        days_until_deadline=10,
    )
    # Should not contain user name, email, or other PII
    assert "test@example.com" not in prompt
    assert "Test User" not in prompt


# ── build_fallback_enrichment ────────────────────────────────


def test_fallback_returns_valid_dict():
    solver_result = _make_solver_result()
    result = build_fallback_enrichment(
        solver_result, "Math Exam", 30
    )
    assert "strategy_note" in result
    assert "task_descriptions" in result
    assert "day_type_reason" in result
    assert isinstance(result["task_descriptions"], dict)


def test_fallback_has_task_descriptions_for_each_task():
    solver_result = _make_solver_result()
    result = build_fallback_enrichment(
        solver_result, "Goal", 30
    )
    for task in solver_result.scheduled_tasks:
        assert task.title in result["task_descriptions"]


def test_fallback_different_day_types():
    for day_type in ["standard", "stretch", "minimum_viable", "recovery", "compressed"]:
        solver_result = _make_solver_result(day_type=day_type)
        result = build_fallback_enrichment(
            solver_result, "Goal", 30
        )
        assert result["strategy_note"]  # should always have content
        assert result["day_type_reason"]


# ── LLM Fallback Chain Tests (#8) ────────────────────────────

@pytest.mark.asyncio
async def test_openrouter_503_returns_none():
    """When OpenRouter returns 503, _call_openrouter should return (None, usage)."""
    with patch("app.services.llm_service.httpx.AsyncClient") as mock_client:
        mock_response = AsyncMock()
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "503 Service Unavailable",
            request=httpx.Request("POST", "https://openrouter.ai"),
            response=httpx.Response(503),
        )
        mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

        result, usage = await _call_openrouter("test prompt", "fake_key", "fake_model")
        assert result is None


@pytest.mark.asyncio
async def test_groq_503_returns_none():
    """When Groq returns 503, _call_groq should return (None, usage)."""
    with patch("app.services.llm_service.httpx.AsyncClient") as mock_client:
        mock_response = AsyncMock()
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "503 Service Unavailable",
            request=httpx.Request("POST", "https://api.groq.com"),
            response=httpx.Response(503),
        )
        mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

        result, usage = await _call_groq("test prompt", "fake_key")
        assert result is None


@pytest.mark.asyncio
async def test_fallback_chain_openrouter_fails_groq_succeeds():
    """When OpenRouter fails, call_llm should fall back to Groq."""

    with patch("app.services.llm_service._call_openrouter", new_callable=AsyncMock) as mock_or, \
         patch("app.services.llm_service._call_groq", new_callable=AsyncMock) as mock_groq, \
         patch("app.services.llm_service.settings") as mock_settings:

        mock_settings.OPENROUTER_API_KEY = "fake"
        mock_settings.GROQ_API_KEY = "fake"

        # OpenRouter fails
        mock_or.return_value = (None, {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})
        # Groq succeeds
        mock_groq.return_value = (
            {"strategy_note": "from groq"},
            {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        )

        result = await call_llm("test prompt")
        assert result is not None
        assert result["strategy_note"] == "from groq"
        mock_groq.assert_called_once()


@pytest.mark.asyncio
async def test_fallback_chain_all_fail_returns_none():
    """When all providers fail, call_llm returns None (never raises)."""
    with patch("app.services.llm_service._call_openrouter", new_callable=AsyncMock) as mock_or, \
         patch("app.services.llm_service._call_groq", new_callable=AsyncMock) as mock_groq, \
         patch("app.services.llm_service._call_ollama", new_callable=AsyncMock) as mock_ollama, \
         patch("app.services.llm_service.settings") as mock_settings:

        mock_settings.OPENROUTER_API_KEY = "fake"
        mock_settings.GROQ_API_KEY = "fake"

        empty_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        mock_or.return_value = (None, empty_usage)
        mock_groq.return_value = (None, empty_usage)
        mock_ollama.return_value = (None, empty_usage)

        result = await call_llm("test prompt")
        assert result is None
