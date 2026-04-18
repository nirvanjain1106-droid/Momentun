from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Iterable

from app.core.timezone import get_user_today

from fastapi import HTTPException, status
from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.goal import DailyLog, DetectedPattern, Goal, Task, TaskLog
from app.models.user import User, UserBehaviouralProfile
from app.schemas.insights import (
    HeatmapEntry,
    HeatmapResponse,
    PatternResponse,
    PatternsResponse,
    StreakResponse,
    SubjectTrajectoryResponse,
    TrajectoryResponse,
    WeeklyDayInsightResponse,
    WeeklyInsightsResponse,
)
from app.core.constants import PATTERN_MIN_SAMPLES

PATTERN_LOOKBACK_DAYS = 42
DAY_NAMES = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]
SUCCESS_STATUSES = {"completed"}


@dataclass
class TaskPerformanceRecord:
    log_date: date
    title: str
    task_type: str
    duration_mins: int
    scheduled_start: str
    status: str
    actual_duration_mins: Optional[int]


async def get_patterns(
    user: User,
    db: AsyncSession,
) -> PatternsResponse:
    goal = await _get_active_goal(user.id, db)
    patterns = await detect_patterns(
        user_id=user.id,
        goal=goal,
        db=db,
        as_of=get_user_today(getattr(user, "timezone", "Asia/Kolkata")),
        persist=True,
    )
    return PatternsResponse(patterns=patterns, total_active=len(patterns))


async def get_trajectory(
    user: User,
    db: AsyncSession,
    goal_id: Optional[uuid.UUID] = None,
) -> TrajectoryResponse:
    goal = await _require_active_goal(user.id, db, goal_id)
    behavioural = await _require_behavioural_profile(user.id, db)
    return await calculate_trajectory(
        user_id=user.id,
        goal=goal,
        behavioural=behavioural,
        db=db,
        as_of=get_user_today(getattr(user, "timezone", "Asia/Kolkata")),
    )


async def get_weekly_insights(
    user: User,
    db: AsyncSession,
    week_start: Optional[str] = None,
) -> WeeklyInsightsResponse:
    goal = await _require_active_goal(user.id, db)
    behavioural = await _require_behavioural_profile(user.id, db)

    if week_start:
        start_date = date.fromisoformat(week_start)
    else:
        today = get_user_today(user.timezone)
        start_date = today - timedelta(days=today.weekday())
    end_date = start_date + timedelta(days=6)

    logs = await _load_daily_logs(user.id, db, start_date, end_date)
    # Fix #7 — only persist patterns when viewing the current week
    is_current_week = (start_date <= get_user_today(getattr(user, "timezone", "Asia/Kolkata")) <= end_date)
    patterns = await detect_patterns(
        user_id=user.id,
        goal=goal,
        db=db,
        as_of=end_date,
        persist=is_current_week,
    )
    trajectory = await calculate_trajectory(
        user_id=user.id,
        goal=goal,
        behavioural=behavioural,
        db=db,
        as_of=min(get_user_today(user.timezone), end_date),
    )

    breakdown = _build_weekly_breakdown(start_date, logs)
    scheduled = sum(item.tasks_scheduled for item in breakdown)
    completed = sum(item.tasks_completed for item in breakdown)
    completion_rate = round(completed / scheduled, 3) if scheduled else 0.0

    moods = [item.mood_score for item in breakdown if item.mood_score is not None]
    average_mood = round(sum(moods) / len(moods), 2) if moods else None

    days_with_work = [item for item in breakdown if item.tasks_scheduled > 0]
    best_day = None
    toughest_day = None
    if days_with_work:
        best_day = max(
            days_with_work,
            key=lambda item: ((item.completion_rate or 0.0), item.tasks_completed),
        ).weekday
        toughest_day = min(
            days_with_work,
            key=lambda item: ((item.completion_rate or 0.0), -item.tasks_completed),
        ).weekday

    coaching_note = build_weekly_coaching_note(
        breakdown=breakdown,
        patterns=patterns,
        trajectory=trajectory,
    )

    return WeeklyInsightsResponse(
        week_start_date=start_date,
        week_end_date=end_date,
        tasks_scheduled=scheduled,
        tasks_completed=completed,
        completion_rate=completion_rate,
        average_mood=average_mood,
        best_day=best_day,
        toughest_day=toughest_day,
        coaching_note=coaching_note,
        motivational_nudge=trajectory.motivational_nudge,
        patterns=patterns,
        day_breakdown=breakdown,
        trajectory=trajectory,
    )


async def get_live_schedule_context(
    user: User,
    goal: Goal,
    db: AsyncSession,
    target_date: date,
) -> tuple[list[PatternResponse], Optional[TrajectoryResponse]]:
    behavioural = await _get_behavioural_profile(user.id, db)
    patterns = await detect_patterns(
        user_id=user.id,
        goal=goal,
        db=db,
        as_of=target_date,
        persist=False,
    )

    trajectory = None
    if behavioural:
        trajectory = await calculate_trajectory(
            user_id=user.id,
            goal=goal,
            behavioural=behavioural,
            db=db,
            as_of=target_date,
        )

    return patterns, trajectory


async def detect_patterns(
    user_id: uuid.UUID,
    goal: Optional[Goal],
    db: AsyncSession,
    as_of: date,
    persist: bool,
) -> list[PatternResponse]:
    start_date = as_of - timedelta(days=PATTERN_LOOKBACK_DAYS - 1)
    task_records = await _load_task_performance(
        user_id,
        goal.id if goal else None,
        db,
        start_date,
        as_of,
    )
    daily_logs = await _load_daily_logs(user_id, db, start_date, as_of)

    patterns: list[PatternResponse] = []

    day_pattern = _detect_day_of_week_avoidance(task_records)
    if day_pattern:
        patterns.append(day_pattern)

    time_pattern = _detect_time_of_day_decay(task_records)
    if time_pattern:
        patterns.append(time_pattern)

    streak_pattern = _detect_streak_vulnerability(daily_logs)
    if streak_pattern:
        patterns.append(streak_pattern)

    collapse_pattern = _detect_post_bad_day_collapse(daily_logs)
    if collapse_pattern:
        patterns.append(collapse_pattern)

    subject_pattern = _detect_subject_avoidance(task_records, goal)
    if subject_pattern:
        patterns.append(subject_pattern)

    overload_pattern = _detect_overload_triggers(daily_logs)
    if overload_pattern:
        patterns.append(overload_pattern)

    golden_hour = _detect_golden_hour(task_records)
    if golden_hour:
        patterns.append(golden_hour)

    patterns.sort(key=lambda item: (_severity_rank(item.severity), item.pattern_type))

    if persist and goal:
        await _sync_detected_patterns(user_id=user_id, goal_id=goal.id, patterns=patterns, db=db)

    return patterns


async def calculate_trajectory(
    user_id: uuid.UUID,
    goal: Goal,
    behavioural: UserBehaviouralProfile,
    db: AsyncSession,
    as_of: date,
) -> TrajectoryResponse:
    goal_start = goal.created_at.date()
    total_goal_days = max(1, (goal.target_date - goal_start).days + 1)
    elapsed_days = min(total_goal_days, max(1, (as_of - goal_start).days + 1))
    days_remaining = max(0, (goal.target_date - as_of).days)

    task_records = await _load_task_performance(user_id, goal.id, db, goal_start, as_of)
    completed_study_mins = sum(_progress_minutes(record) for record in task_records)

    daily_target_mins = int(float(behavioural.daily_commitment_hrs) * 60)
    expected_by_now = min(total_goal_days, elapsed_days) * daily_target_mins
    target_total = total_goal_days * daily_target_mins

    current_pace = completed_study_mins / max(elapsed_days, 1)
    projected_total = int(completed_study_mins + (current_pace * days_remaining))
    remaining_gap = max(0, target_total - completed_study_mins)
    required_pace = remaining_gap / max(days_remaining, 1) if days_remaining else 0.0
    extra_needed = max(0, math.ceil(required_pace - current_pace))

    projected_ratio = projected_total / target_total if target_total else 1.0
    if projected_ratio >= 1.05:
        status_value = "ahead"
    elif projected_ratio >= 0.95:
        status_value = "on_track"
    elif projected_ratio >= 0.75:
        status_value = "behind"
    else:
        status_value = "critical"

    subject_breakdown = _build_subject_trajectory(
        task_records=task_records,
        goal=goal,
        expected_by_now=expected_by_now,
        target_total=target_total,
        days_remaining=days_remaining,
    )

    projection = _build_projection_copy(
        status_value=status_value,
        projected_total=projected_total,
        target_total=target_total,
        extra_needed=extra_needed,
        days_remaining=days_remaining,
    )
    nudge = build_motivational_nudge(
        status_value=status_value,
        days_remaining=days_remaining,
        extra_mins_per_day=extra_needed,
    )

    return TrajectoryResponse(
        goal_id=goal.id,
        goal_title=goal.title,
        goal_type=goal.goal_type,
        status=status_value,
        projection=projection,
        days_remaining=days_remaining,
        elapsed_days=elapsed_days,
        completed_study_mins=completed_study_mins,
        expected_study_mins_by_now=expected_by_now,
        projected_total_mins_by_deadline=projected_total,
        target_total_mins_by_deadline=target_total,
        current_pace_mins_per_day=round(current_pace, 1),
        required_pace_mins_per_day=round(required_pace, 1),
        extra_mins_per_day_needed=extra_needed,
        subject_breakdown=subject_breakdown,
        motivational_nudge=nudge,
    )


def build_weekly_coaching_note(
    breakdown: list[WeeklyDayInsightResponse],
    patterns: list[PatternResponse],
    trajectory: TrajectoryResponse,
) -> str:
    active_days = [item for item in breakdown if item.tasks_scheduled > 0]
    best_day = None
    worst_day = None
    if active_days:
        best_day = max(active_days, key=lambda item: item.completion_rate or 0.0)
        worst_day = min(active_days, key=lambda item: item.completion_rate or 0.0)

    lines: list[str] = []
    if best_day and worst_day and best_day.weekday != worst_day.weekday:
        lines.append(
            f"You crushed {best_day.weekday} but slipped on {worst_day.weekday.lower()}."
        )
    elif best_day:
        lines.append(
            f"Your strongest day this week was {best_day.weekday}, so repeat that setup."
        )

    focus_pattern = next(
        (
            pattern for pattern in patterns
            if pattern.pattern_type in {
                "day_of_week_avoidance",
                "subject_avoidance",
                "overload_triggers",
            }
        ),
        patterns[0] if patterns else None,
    )
    if focus_pattern:
        lines.append(focus_pattern.fix)

    if trajectory.status in {"behind", "critical"}:
        lines.append(
            f"Right now you're {trajectory.status.replace('_', ' ')} and need "
            f"{trajectory.extra_mins_per_day_needed} extra mins/day to close the gap."
        )
    else:
        lines.append(
            f"Your current pace is {trajectory.status.replace('_', ' ')}, "
            f"so protect the routines that are already working."
        )

    return " ".join(lines)


def build_motivational_nudge(
    status_value: str,
    days_remaining: int,
    extra_mins_per_day: int,
) -> str:
    urgent = days_remaining <= 14

    if status_value == "ahead":
        if urgent:
            return (
                f"You're ahead with {days_remaining} days left. Stay sharp and do not "
                "trade momentum for complacency."
            )
        return "You're ahead. Keep the floor high and let consistency compound."

    if status_value == "on_track":
        if urgent:
            return (
                f"You're on track with {days_remaining} days left. Protect every focused block now."
            )
        return "You're on track. Keep stacking clean days instead of chasing perfect ones."

    if status_value == "behind":
        if urgent:
            return (
                f"Time is tight: {days_remaining} days left and about {extra_mins_per_day} extra mins/day needed. "
                "Shrink distractions and win the first block."
            )
        return (
            f"You're behind right now, but the gap is still recoverable with about "
            f"{extra_mins_per_day} extra mins/day."
        )

    if urgent:
        return (
            f"You're in catch-up mode with {days_remaining} days left. Strip the day down and "
            "protect the highest-value work first."
        )
    return (
        f"You're off pace. Reduce friction, keep the plan smaller, and find "
        f"{extra_mins_per_day} extra mins/day where you can."
    )


def build_pattern_focus_line(patterns: Iterable[PatternResponse]) -> Optional[str]:
    ordered = list(patterns)
    if not ordered:
        return None

    pattern = ordered[0]
    data = pattern.supporting_data or {}

    if pattern.pattern_type == "subject_avoidance":
        label = data.get("label", "that subject")
        return f"Your {label} avoidance is active - schedule it first today."

    if pattern.pattern_type == "day_of_week_avoidance":
        weekday = data.get("weekday", "that day")
        return f"{weekday} is usually shaky - front-load the hardest block."

    if pattern.pattern_type == "time_of_day_decay":
        threshold = data.get("threshold_label", "late evening")
        return f"{threshold} is a danger zone - finish your hardest work before then."

    if pattern.pattern_type == "overload_triggers":
        threshold = data.get("threshold", 4)
        return f"When your day crosses {threshold} tasks, completion drops - keep today tight."

    return pattern.fix


def summarize_patterns_for_prompt(patterns: Iterable[PatternResponse]) -> str:
    items = list(patterns)[:3]
    if not items:
        return "No active behaviour patterns detected."

    lines = []
    for pattern in items:
        data = pattern.supporting_data or {}
        label = data.get("label") or data.get("weekday") or pattern.pattern_type
        lines.append(
            f"- {label}: {pattern.insight} Recommended response: {pattern.fix}"
        )
    return "\n".join(lines)


def trajectory_prompt_snapshot(trajectory: Optional[TrajectoryResponse]) -> str:
    if not trajectory:
        return "Trajectory unavailable."

    return (
        f"Status: {trajectory.status}. "
        f"Days remaining: {trajectory.days_remaining}. "
        f"Current pace: {trajectory.current_pace_mins_per_day} mins/day. "
        f"Required pace: {trajectory.required_pace_mins_per_day} mins/day. "
        f"Extra mins/day needed: {trajectory.extra_mins_per_day_needed}."
    )


async def refresh_patterns_after_evening_review(
    user_id: uuid.UUID,
    db: AsyncSession,
    as_of: date,
) -> list[PatternResponse]:
    goal = await _get_active_goal(user_id, db)
    if not goal:
        return []

    return await detect_patterns(
        user_id=user_id,
        goal=goal,
        db=db,
        as_of=as_of,
        persist=True,
    )


def _build_projection_copy(
    status_value: str,
    projected_total: int,
    target_total: int,
    extra_needed: int,
    days_remaining: int,
) -> str:
    shortfall = max(0, target_total - projected_total)
    if status_value == "ahead":
        return (
            f"At your current pace, you're projected to land ahead of target by "
            f"{projected_total - target_total} mins."
        )
    if status_value == "on_track":
        return "At your current pace, you're projected to hit your goal."
    if days_remaining == 0:
        return "The deadline is here and the current pace is short of the target."
    return (
        f"At your current pace, you're projected to finish {shortfall} mins short "
        f"and need about {extra_needed} extra mins/day."
    )


def _build_subject_trajectory(
    task_records: list[TaskPerformanceRecord],
    goal: Goal,
    expected_by_now: int,
    target_total: int,
    days_remaining: int,
) -> list[SubjectTrajectoryResponse]:
    subjects = _goal_subjects(goal)
    if not subjects:
        return []

    weak = {item.lower() for item in (goal.goal_metadata or {}).get("weak_subjects", [])}
    strong = {item.lower() for item in (goal.goal_metadata or {}).get("strong_subjects", [])}

    weights: dict[str, float] = {}
    for subject in subjects:
        lower = subject.lower()
        if lower in weak:
            weights[subject] = 1.4
        elif lower in strong:
            weights[subject] = 0.8
        else:
            weights[subject] = 1.0

    total_weight = sum(weights.values()) or 1.0
    completed_by_subject = {subject: 0 for subject in subjects}

    for record in task_records:
        subject = _infer_subject_label(record.title, goal)
        if subject in completed_by_subject:
            completed_by_subject[subject] += _progress_minutes(record)

    results: list[SubjectTrajectoryResponse] = []
    for subject in subjects:
        share = weights[subject] / total_weight
        target_now = int(expected_by_now * share)
        target_deadline = int(target_total * share)
        completed = completed_by_subject[subject]
        gap = max(0, target_now - completed)
        remaining_gap = max(0, target_deadline - completed)
        extra_per_day = math.ceil(remaining_gap / max(days_remaining, 1)) if days_remaining else remaining_gap

        if completed >= target_now * 1.05:
            status_value = "ahead"
        elif completed >= target_now * 0.9:
            status_value = "on_track"
        else:
            status_value = "behind"

        results.append(
            SubjectTrajectoryResponse(
                subject=subject,
                status=status_value,
                completed_mins=completed,
                target_mins_by_now=target_now,
                target_mins_by_deadline=target_deadline,
                gap_mins=gap,
                extra_mins_per_day_needed=extra_per_day,
            )
        )

    return sorted(results, key=lambda item: (item.status != "behind", -item.gap_mins, item.subject))


def _build_weekly_breakdown(
    start_date: date,
    logs: list[DailyLog],
) -> list[WeeklyDayInsightResponse]:
    log_map = {log.log_date: log for log in logs}
    results: list[WeeklyDayInsightResponse] = []

    for offset in range(7):
        current = start_date + timedelta(days=offset)
        log = log_map.get(current)
        results.append(
            WeeklyDayInsightResponse(
                log_date=current,
                weekday=current.strftime("%A"),
                tasks_scheduled=log.tasks_scheduled or 0 if log else 0,
                tasks_completed=log.tasks_completed or 0 if log else 0,
                completion_rate=round(log.completion_rate, 3) if log and log.completion_rate is not None else None,
                mood_score=log.mood_score if log else None,
            )
        )

    return results


def _detect_day_of_week_avoidance(
    task_records: list[TaskPerformanceRecord],
) -> Optional[PatternResponse]:
    stats: dict[int, dict[str, int]] = {}
    for record in task_records:
        weekday = record.log_date.weekday()
        bucket = stats.setdefault(weekday, {"total": 0, "failed": 0})
        bucket["total"] += 1
        if record.status not in SUCCESS_STATUSES:
            bucket["failed"] += 1

    candidate = None
    for weekday, data in stats.items():
        if data["total"] < PATTERN_MIN_SAMPLES["day_of_week_avoidance"]:
            continue
        failure_rate = data["failed"] / data["total"]
        if failure_rate >= 0.65:
            if candidate is None or failure_rate > candidate["failure_rate"]:
                candidate = {
                    "weekday": weekday,
                    "failure_rate": failure_rate,
                    "total": data["total"],
                }

    if not candidate:
        return None

    weekday_name = DAY_NAMES[candidate["weekday"]]
    failure_pct = int(round(candidate["failure_rate"] * 100))
    return PatternResponse(
        pattern_type="day_of_week_avoidance",
        severity=_severity_from_ratio(candidate["failure_rate"]),
        insight=f"You miss about {failure_pct}% of tasks on {weekday_name}s.",
        fix=f"Treat {weekday_name} as a fragile day and schedule the hardest task first.",
        supporting_data={
            "weekday": weekday_name,
            "failure_rate": round(candidate["failure_rate"], 3),
            "samples": candidate["total"],
        },
    )


def _detect_time_of_day_decay(
    task_records: list[TaskPerformanceRecord],
) -> Optional[PatternResponse]:
    buckets = {
        "after_9pm": {"threshold": 21 * 60, "label": "After 9 PM"},
        "after_7pm": {"threshold": 19 * 60, "label": "After 7 PM"},
    }
    candidate = None

    for bucket in buckets.values():
        matching = [
            record for record in task_records
            if _time_to_minutes(record.scheduled_start) >= bucket["threshold"]
        ]
        if len(matching) < PATTERN_MIN_SAMPLES["time_of_day_decay"]:
            continue
        failure_rate = sum(1 for record in matching if record.status not in SUCCESS_STATUSES) / len(matching)
        if failure_rate >= 0.7:
            if candidate is None or failure_rate > candidate["failure_rate"]:
                candidate = {
                    "failure_rate": failure_rate,
                    "samples": len(matching),
                    "label": bucket["label"],
                }

    if not candidate:
        return None

    failure_pct = int(round(candidate["failure_rate"] * 100))
    return PatternResponse(
        pattern_type="time_of_day_decay",
        severity=_severity_from_ratio(candidate["failure_rate"]),
        insight=f"Tasks {candidate['label'].lower()} fail about {failure_pct}% of the time.",
        fix="Stop placing deep work late. Pull demanding tasks earlier into the day.",
        supporting_data={
            "threshold_label": candidate["label"],
            "failure_rate": round(candidate["failure_rate"], 3),
            "samples": candidate["samples"],
        },
    )


def _detect_streak_vulnerability(
    daily_logs: list[DailyLog],
) -> Optional[PatternResponse]:
    ordered = sorted(daily_logs, key=lambda item: item.log_date)
    if len(ordered) < PATTERN_MIN_SAMPLES["streak_vulnerability"]:
        return None

    break_lengths: list[int] = []
    streak = 0
    previous_date = None

    for log in ordered:
        successful = (log.completion_rate or 0.0) >= 0.6
        if previous_date and (log.log_date - previous_date).days != 1:
            streak = 0

        if successful:
            streak += 1
        else:
            if streak >= 2:
                break_lengths.append(streak + 1)
            streak = 0

        previous_date = log.log_date

    if len(break_lengths) < 2:
        return None

    counts: dict[int, int] = {}
    for length in break_lengths:
        counts[length] = counts.get(length, 0) + 1

    break_day, count = max(counts.items(), key=lambda item: item[1])
    if count < 2:
        return None

    consistency = count / len(break_lengths)
    if consistency < 0.5:
        return None

    severity = "high" if break_day <= 4 else "medium"
    return PatternResponse(
        pattern_type="streak_vulnerability",
        severity=severity,
        insight=f"You tend to wobble around day {break_day} of a streak.",
        fix=f"Make day {break_day} lighter on purpose so the streak survives past the danger point.",
        supporting_data={
            "break_day": break_day,
            "consistency": round(consistency, 3),
            "samples": len(break_lengths),
        },
    )


def _detect_post_bad_day_collapse(
    daily_logs: list[DailyLog],
) -> Optional[PatternResponse]:
    ordered = sorted(daily_logs, key=lambda item: item.log_date)
    if len(ordered) < PATTERN_MIN_SAMPLES["post_bad_day_collapse"]:
        return None

    log_map = {log.log_date: log for log in ordered}
    collapse_events = 0
    bad_days = 0

    for log in ordered:
        if (log.completion_rate or 0.0) >= 0.35:
            continue

        next_days = [
            log_map.get(log.log_date + timedelta(days=offset))
            for offset in range(1, 4)
        ]
        observed = [item for item in next_days if item is not None]
        if len(observed) < 2:
            continue

        bad_days += 1
        avg_follow_up = sum(item.completion_rate or 0.0 for item in observed) / len(observed)
        if avg_follow_up < 0.45:
            collapse_events += 1

    if bad_days < 2:
        return None

    collapse_rate = collapse_events / bad_days
    if collapse_rate < 0.6:
        return None

    return PatternResponse(
        pattern_type="post_bad_day_collapse",
        severity=_severity_from_ratio(collapse_rate),
        insight="A single rough day often drags the next few days down too.",
        fix="After a bad day, force the next day into recovery mode instead of trying to catch up immediately.",
        supporting_data={
            "collapse_rate": round(collapse_rate, 3),
            "bad_days_observed": bad_days,
            "collapse_events": collapse_events,
        },
    )


def _detect_subject_avoidance(
    task_records: list[TaskPerformanceRecord],
    goal: Optional[Goal],
) -> Optional[PatternResponse]:
    labels: dict[str, dict[str, int]] = {}

    for record in task_records:
        label = _infer_subject_label(record.title, goal)
        if not label:
            continue
        bucket = labels.setdefault(label, {"total": 0, "failed": 0})
        bucket["total"] += 1
        if record.status not in SUCCESS_STATUSES:
            bucket["failed"] += 1

    candidate = None
    for label, data in labels.items():
        if data["total"] < PATTERN_MIN_SAMPLES["subject_avoidance"]:
            continue
        failure_rate = data["failed"] / data["total"]
        if failure_rate >= 0.7:
            if candidate is None or failure_rate > candidate["failure_rate"]:
                candidate = {
                    "label": label,
                    "failure_rate": failure_rate,
                    "total": data["total"],
                }

    if not candidate:
        return None

    failure_pct = int(round(candidate["failure_rate"] * 100))
    return PatternResponse(
        pattern_type="subject_avoidance",
        severity=_severity_from_ratio(candidate["failure_rate"]),
        insight=f"You skip {candidate['label']} about {failure_pct}% of the time.",
        fix=f"Put {candidate['label']} first and make the opening block smaller so it actually starts.",
        supporting_data={
            "label": candidate["label"],
            "failure_rate": round(candidate["failure_rate"], 3),
            "samples": candidate["total"],
        },
    )


def _detect_overload_triggers(
    daily_logs: list[DailyLog],
) -> Optional[PatternResponse]:
    overloaded = [
        log for log in daily_logs
        if (log.tasks_scheduled or 0) > 4 and log.completion_rate is not None
    ]
    balanced = [
        log for log in daily_logs
        if (log.tasks_scheduled or 0) <= 4 and log.tasks_scheduled is not None and log.completion_rate is not None
    ]

    if len(overloaded) < PATTERN_MIN_SAMPLES["overload_triggers"] or not balanced:
        return None

    overloaded_rate = sum(log.completion_rate or 0.0 for log in overloaded) / len(overloaded)
    balanced_rate = sum(log.completion_rate or 0.0 for log in balanced) / len(balanced)

    if overloaded_rate > 0.45 or (balanced_rate - overloaded_rate) < 0.2:
        return None

    return PatternResponse(
        pattern_type="overload_triggers",
        severity=_severity_from_ratio(1 - overloaded_rate),
        insight="When more than 4 tasks are scheduled, your completion rate drops sharply.",
        fix="Cap overloaded days at 4 meaningful tasks and move the rest into later early.",
        supporting_data={
            "threshold": 4,
            "overloaded_completion_rate": round(overloaded_rate, 3),
            "balanced_completion_rate": round(balanced_rate, 3),
            "samples": len(overloaded),
        },
    )


async def _sync_detected_patterns(
    user_id: uuid.UUID,
    goal_id: uuid.UUID,
    patterns: list[PatternResponse],
    db: AsyncSession,
) -> None:
    """
    Fix #8 — only write to DB when patterns actually changed.
    Compares current active pattern types against incoming ones
    before doing any writes.
    """
    # Load current active patterns
    result = await db.execute(
        select(DetectedPattern).where(
            and_(
                DetectedPattern.user_id == user_id,
                DetectedPattern.goal_id == goal_id,
                DetectedPattern.is_active.is_(True),
            )
        )
    )
    existing = result.scalars().all()
    existing_types = {p.pattern_type for p in existing}
    incoming_types = {p.pattern_type for p in patterns}

    # Skip write if pattern types are identical
    if existing_types == incoming_types and len(existing) == len(patterns):
        return

    # Deactivate old patterns
    await db.execute(
        update(DetectedPattern)
        .where(
            and_(
                DetectedPattern.user_id == user_id,
                DetectedPattern.goal_id == goal_id,
                DetectedPattern.is_active.is_(True),
            )
        )
        .values(is_active=False)
    )

    expiry = datetime.now(timezone.utc) + timedelta(days=7)
    for pattern in patterns:
        db.add(
            DetectedPattern(
                user_id=user_id,
                goal_id=goal_id,
                pattern_type=pattern.pattern_type,
                severity=pattern.severity,
                insight=pattern.insight,
                fix=pattern.fix,
                supporting_data=pattern.supporting_data,
                is_active=True,
                expires_at=expiry,
            )
        )

    await db.flush()


async def _load_task_performance(
    user_id: uuid.UUID,
    goal_id: Optional[uuid.UUID],
    db: AsyncSession,
    start_date: date,
    end_date: date,
) -> list[TaskPerformanceRecord]:
    stmt = (
        select(Task, TaskLog, DailyLog)
        .join(TaskLog, TaskLog.task_id == Task.id)
        .join(DailyLog, DailyLog.id == TaskLog.daily_log_id)
        .where(
            and_(
                Task.user_id == user_id,
                DailyLog.log_date >= start_date,
                DailyLog.log_date <= end_date,
                Task.deleted_at.is_(None),
            )
        )
    )
    if goal_id:
        stmt = stmt.where(Task.goal_id == goal_id)

    result = await db.execute(stmt.order_by(DailyLog.log_date))
    rows = result.all()
    return [
        TaskPerformanceRecord(
            log_date=log.log_date,
            title=task.title,
            task_type=task.task_type,
            duration_mins=task.duration_mins,
            scheduled_start=task.scheduled_start,
            status=task_log.status,
            actual_duration_mins=task_log.actual_duration_mins,
        )
        for task, task_log, log in rows
    ]


async def _load_daily_logs(
    user_id: uuid.UUID,
    db: AsyncSession,
    start_date: date,
    end_date: date,
) -> list[DailyLog]:
    result = await db.execute(
        select(DailyLog)
        .where(
            and_(
                DailyLog.user_id == user_id,
                DailyLog.log_date >= start_date,
                DailyLog.log_date <= end_date,
            )
        )
        .order_by(DailyLog.log_date)
    )
    return list(result.scalars().all())


async def _get_active_goal(
    user_id: uuid.UUID,
    db: AsyncSession,
) -> Optional[Goal]:
    result = await db.execute(
        select(Goal).where(
            and_(
                Goal.user_id == user_id,
                Goal.status == "active",
                Goal.deleted_at.is_(None),
            )
        )
    )
    return result.scalar_one_or_none()


async def _require_active_goal(
    user_id: uuid.UUID,
    db: AsyncSession,
    goal_id: Optional[uuid.UUID] = None,
) -> Goal:
    if goal_id:
        result = await db.execute(
            select(Goal).where(
                and_(
                    Goal.id == goal_id,
                    Goal.user_id == user_id,
                    Goal.deleted_at.is_(None)
                )
            )
        )
        goal = result.scalar_one_or_none()
        if not goal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Goal not found"
            )
        return goal

    goal = await _get_active_goal(user_id, db)
    if goal:
        return goal

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Create an active goal before requesting trajectory or insights.",
    )


async def _get_behavioural_profile(
    user_id: uuid.UUID,
    db: AsyncSession,
) -> Optional[UserBehaviouralProfile]:
    result = await db.execute(
        select(UserBehaviouralProfile).where(UserBehaviouralProfile.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def _require_behavioural_profile(
    user_id: uuid.UUID,
    db: AsyncSession,
) -> UserBehaviouralProfile:
    behavioural = await _get_behavioural_profile(user_id, db)
    if behavioural:
        return behavioural

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Complete your behavioural profile before requesting trajectory or insights.",
    )


def _progress_minutes(record: TaskPerformanceRecord) -> int:
    if record.task_type == "break":
        return 0
    if record.status == "completed":
        return record.actual_duration_mins or record.duration_mins
    if record.status == "partial":
        if record.actual_duration_mins is not None:
            return record.actual_duration_mins
        return max(15, record.duration_mins // 2)
    return 0


def _goal_subjects(goal: Goal) -> list[str]:
    metadata = goal.goal_metadata or {}
    subjects = metadata.get("subjects") or []
    return [str(subject) for subject in subjects if str(subject).strip()]


def _infer_subject_label(title: str, goal: Optional[Goal]) -> Optional[str]:
    if not title:
        return None

    clean_title = title.strip()
    if goal:
        for subject in _goal_subjects(goal):
            if subject.lower() in clean_title.lower():
                return subject

    for separator in (" - ", " -- ", " | "):
        if separator in clean_title:
            return clean_title.split(separator, 1)[0].strip()

    return clean_title if len(clean_title) <= 40 else None


def _severity_rank(value: str) -> int:
    order = {
        "critical": 0,
        "high": 1,
        "medium": 2,
        "low": 3,
    }
    return order.get(value, 4)


def _severity_from_ratio(ratio: float) -> str:
    if ratio >= 0.85:
        return "critical"
    if ratio >= 0.75:
        return "high"
    if ratio >= 0.6:
        return "medium"
    return "low"


def _time_to_minutes(value: str) -> int:
    parts = str(value).split(":")
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except (IndexError, ValueError):
        return 0


def _detect_golden_hour(
    task_records: list[TaskPerformanceRecord],
) -> Optional[PatternResponse]:
    """
    Find the user's most productive 2-hour window.
    A window needs >90% completion rate with 5+ samples to qualify.
    """
    if len(task_records) < 10:
        return None

    # Group by 2-hour windows (0-2, 2-4, ..., 22-24)
    windows: dict[int, dict[str, int]] = {}
    for record in task_records:
        mins = _time_to_minutes(record.scheduled_start)
        window_start = (mins // 120) * 2  # 2-hour window start in hours
        bucket = windows.setdefault(window_start, {"total": 0, "completed": 0})
        bucket["total"] += 1
        if record.status in SUCCESS_STATUSES:
            bucket["completed"] += 1

    best = None
    for window_start, data in windows.items():
        if data["total"] < 5:
            continue
        rate = data["completed"] / data["total"]
        if rate >= 0.90:
            if best is None or rate > best["rate"]:
                best = {
                    "window_start": window_start,
                    "rate": rate,
                    "samples": data["total"],
                }

    if not best:
        return None

    start_h = best["window_start"]
    end_h = start_h + 2
    label = f"{start_h:02d}:00–{end_h:02d}:00"
    pct = int(round(best["rate"] * 100))

    return PatternResponse(
        pattern_type="golden_hour",
        severity="low",  # positive pattern, not a vulnerability
        insight=f"Your completion rate is {pct}% during {label} — this is your golden hour.",
        fix=f"Protect {label} for your highest-priority Core tasks. Never schedule admin work here.",
        supporting_data={
            "window_start": f"{start_h:02d}:00",
            "window_end": f"{end_h:02d}:00",
            "completion_rate": round(best["rate"], 3),
            "samples": best["samples"],
        },
    )


# ── Streak & Heatmap ─────────────────────────────────────────────


async def get_streak(
    user: "User",
    db: AsyncSession,
) -> StreakResponse:
    """Calculate current and best streak."""
    today = get_user_today(getattr(user, "timezone", "Asia/Kolkata"))
    logs = await _load_daily_logs(user.id, db, today - timedelta(days=365), today)
    ordered = sorted(logs, key=lambda log_entry: log_entry.log_date)

    # Current streak (counting back from today)
    current = 0
    expected = today
    for log in reversed(ordered):
        if log.log_date != expected:
            break
        success_threshold = 0.6
        if log.actual_day_type == "minimum_viable":
            success_threshold = 0.1  # Any completion (>0) counts for MVP days

        if (log.completion_rate or 0.0) >= success_threshold:
            current += 1
            expected -= timedelta(days=1)
        else:
            break

    # Best streak ever
    best = 0
    streak = 0
    prev_date = None
    for log in ordered:
        if prev_date and (log.log_date - prev_date).days != 1:
            streak = 0
        threshold = 0.6
        if log.actual_day_type == "minimum_viable":
            threshold = 0.1
            
        if (log.completion_rate or 0.0) >= threshold:
            streak += 1
            best = max(best, streak)
        else:
            streak = 0
        prev_date = log.log_date

    last_active = ordered[-1].log_date.isoformat() if ordered else None

    return StreakResponse(
        current_streak=current,
        best_streak=best,
        streak_protected=False,  # freeze system not yet implemented
        last_active_date=last_active,
    )


async def get_heatmap(
    user: "User",
    db: AsyncSession,
    days: int = 90,
) -> HeatmapResponse:
    """Generate GitHub-style heatmap data."""
    today = get_user_today(getattr(user, "timezone", "Asia/Kolkata"))
    start = today - timedelta(days=days - 1)
    logs = await _load_daily_logs(user.id, db, start, today)
    log_map = {log_entry.log_date: log_entry for log_entry in logs}

    entries = []
    active_days = 0
    total_rate = 0.0

    for offset in range(days):
        d = start + timedelta(days=offset)
        log = log_map.get(d)

        scheduled = log.tasks_scheduled or 0 if log else 0
        completed = log.tasks_completed or 0 if log else 0
        rate = log.completion_rate if log and log.completion_rate is not None else None

        if rate is not None:
            active_days += 1
            total_rate += rate

        if rate is None or scheduled == 0:
            intensity = "none"
        elif rate >= 0.8:
            intensity = "high"
        elif rate >= 0.5:
            intensity = "medium"
        else:
            intensity = "low"

        entries.append(HeatmapEntry(
            date=d.isoformat(),
            completion_rate=round(rate, 3) if rate is not None else None,
            intensity=intensity,
            tasks_completed=completed,
            tasks_scheduled=scheduled,
            mood_score=log.mood_score if log else None,
        ))

    return HeatmapResponse(
        entries=entries,
        total_days=days,
        active_days=active_days,
        average_completion_rate=round(total_rate / active_days, 3) if active_days else None,
    )
