"""Shared constants used across services and routers."""

# Priority labels — single source of truth
PRIORITY_CORE = 1
PRIORITY_NORMAL = 2
PRIORITY_BONUS = 3

PRIORITY_LABELS = {
    PRIORITY_CORE: "Core",
    PRIORITY_NORMAL: "Normal",
    PRIORITY_BONUS: "Bonus",
}

# Task statuses
TASK_STATUS_ACTIVE = "active"
TASK_STATUS_COMPLETED = "completed"
TASK_STATUS_PARKED = "parked"
TASK_STATUS_DEFERRED = "deferred"
TASK_STATUS_EXPIRED = "expired"

# Goal statuses
GOAL_STATUS_ACTIVE = "active"
GOAL_STATUS_PAUSED = "paused"
GOAL_STATUS_ACHIEVED = "achieved"
GOAL_STATUS_ABANDONED = "abandoned"

# ── Multi-goal policy constants ──────────────────────────────
# These are product decisions, not engineering decisions.
# Change these without touching core infrastructure.
MAX_ACTIVE_GOALS = 3
FLOOR_TASKS_PER_GOAL = 1          # Pass 1: min Core tasks per goal (best-effort, rank order)
FLOOR_ENERGY_DEGRADE = True       # Allow 1 energy mismatch if no compatible Core task
RESUME_RANK_POLICY = "bottom"     # "bottom" assigns lowest rank on resume
HORIZON_GRACE_MINS = 15           # Grace window (minutes) before marking a task expired
# IMPORTANT: The stale-regen path in schedule_service._handle_stale_schedule
# calls generate_schedule with use_llm=False (pure solver, <1s).
# If you ever add LLM enrichment to the stale regen path, this timeout
# MUST be increased to accommodate LLM latency, or you'll get duplicate solves.
REGEN_LOCK_TIMEOUT_SECS = 120    # Seconds before a stale regen lock is force-released

# Pattern thresholds — minimum data points before triggering
# Based on 2-week minimum data collection period
PATTERN_MIN_SAMPLES = {
    "day_of_week_avoidance": 6,   # 3 weeks × 2 tasks/day
    "time_of_day_decay": 5,       # ~3 late-evening occurrences
    "streak_vulnerability": 10,   # 2+ weeks of daily logs
    "post_bad_day_collapse": 10,  # 2+ weeks of daily logs
    "subject_avoidance": 5,       # ~5 task instances per subject
    "overload_triggers": 5,       # 5+ overloaded days
}

# Later staleness
PARKING_LOT_STALE_DAYS = 14

# Schedule bankruptcy — days of inactivity before triggering recovery
BANKRUPTCY_INACTIVITY_DAYS = 2
