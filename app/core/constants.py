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

# Goal statuses
GOAL_STATUS_ACTIVE = "active"
GOAL_STATUS_PAUSED = "paused"
GOAL_STATUS_ACHIEVED = "achieved"
GOAL_STATUS_ABANDONED = "abandoned"

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

# Parking lot staleness
PARKING_LOT_STALE_DAYS = 14

# Schedule bankruptcy — days of inactivity before triggering recovery
BANKRUPTCY_INACTIVITY_DAYS = 2
