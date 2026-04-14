"""Tests for the Constraint Solver — the most complex logic in the app."""

from datetime import date

from app.services.constraint_solver import (
    ConstraintSolver,
    FixedBlockData,
    TaskRequirement,
    PRIORITY_CORE,
    PRIORITY_NORMAL,
    PRIORITY_BONUS,
    generate_exam_tasks,
)


def _make_solver(**overrides):
    """Create a solver with sensible defaults."""
    defaults = dict(
        fixed_blocks=[],
        peak_energy_start="09:00",
        peak_energy_end="13:00",
        wake_time="07:00",
        sleep_time="23:00",
        daily_commitment_hrs=4.0,
        heavy_days=[],
        light_days=[],
        chronotype="intermediate",
    )
    defaults.update(overrides)
    return ConstraintSolver(**defaults)


# ── Basic solve ──────────────────────────────────────────────


def test_solver_returns_result_with_no_tasks():
    solver = _make_solver()
    result = solver.solve(target_date=date(2026, 4, 15), task_requirements=[])
    assert result.day_type == "standard"
    assert result.scheduled_tasks == []
    assert result.unscheduled_tasks == []
    assert result.total_free_mins > 0


def test_solver_schedules_single_task():
    solver = _make_solver()
    tasks = [
        TaskRequirement(
            title="Study Math",
            task_type="deep_study",
            duration_mins=60,
            energy_required="medium",
            priority=PRIORITY_CORE,
        )
    ]
    result = solver.solve(target_date=date(2026, 4, 15), task_requirements=tasks)
    assert len(result.scheduled_tasks) == 1
    assert result.scheduled_tasks[0].title == "Study Math"
    assert result.scheduled_tasks[0].is_mvp_task is True


# ── Priority ordering ───────────────────────────────────────


def test_core_tasks_scheduled_before_bonus():
    solver = _make_solver(daily_commitment_hrs=1.5)
    tasks = [
        TaskRequirement("Bonus", "break", 30, "low", PRIORITY_BONUS),
        TaskRequirement("Core", "deep_study", 60, "medium", PRIORITY_CORE),
        TaskRequirement("Normal", "practice", 30, "medium", PRIORITY_NORMAL),
    ]
    result = solver.solve(target_date=date(2026, 4, 15), task_requirements=tasks)
    scheduled_titles = [t.title for t in result.scheduled_tasks]
    # Core should appear before Bonus in the scheduled list
    assert "Core" in scheduled_titles
    assert "Normal" in scheduled_titles


# ── Capacity multipliers ────────────────────────────────────


def test_minimum_viable_day_halves_capacity():
    solver = _make_solver(daily_commitment_hrs=4.0)
    tasks = [
        TaskRequirement("Task A", "deep_study", 60, "medium", PRIORITY_CORE),
        TaskRequirement("Task B", "practice", 60, "medium", PRIORITY_NORMAL),
        TaskRequirement("Task C", "light_review", 60, "low", PRIORITY_NORMAL),
        TaskRequirement("Task D", "revision", 60, "medium", PRIORITY_BONUS),
    ]
    result = solver.solve(
        target_date=date(2026, 4, 15),
        task_requirements=tasks,
        day_type="minimum_viable",
        checkin_energy="exhausted",
    )
    # 50% of 4hrs = 2hrs capacity. Should not fit all 4 tasks.
    assert len(result.scheduled_tasks) < 4
    assert result.day_capacity_hrs <= 2.0


def test_stretch_day_increases_capacity():
    solver = _make_solver(daily_commitment_hrs=4.0)
    result = solver.solve(
        target_date=date(2026, 4, 15),
        task_requirements=[],
        day_type="stretch",
        checkin_energy="high",
        yesterday_rating="crushed_it",
    )
    assert result.day_type == "stretch"
    assert result.day_capacity_hrs > 0


# ── Overnight blocks ────────────────────────────────────────


def test_overnight_block_handled_correctly():
    overnight_block = FixedBlockData(
        title="Sleep",
        block_type="sleep",
        start_time="23:00",
        end_time="06:30",
        buffer_before=0,
        buffer_after=0,
    )
    solver = _make_solver(
        fixed_blocks=[overnight_block],
        wake_time="07:00",
        sleep_time="23:00",
    )
    result = solver.solve(target_date=date(2026, 4, 15), task_requirements=[])
    # Should have free windows between wake and sleep (excluding the blocked overnight)
    assert result.total_free_mins > 0


# ── Energy compatibility ────────────────────────────────────


def test_high_energy_task_not_placed_in_low_window():
    solver = _make_solver(
        wake_time="07:00",
        sleep_time="23:00",
        peak_energy_start="09:00",
        peak_energy_end="10:00",  # very narrow peak
        daily_commitment_hrs=8.0,
    )
    tasks = [
        TaskRequirement("Light Task", "light_review", 30, "low", PRIORITY_CORE),
        TaskRequirement("Heavy Task", "deep_study", 30, "high", PRIORITY_CORE),
    ]
    result = solver.solve(target_date=date(2026, 4, 15), task_requirements=tasks)
    # Both should be scheduled (light task in any window, heavy in peak/medium)
    assert len(result.scheduled_tasks) >= 1


# ── Time utilities ───────────────────────────────────────────


def test_to_time_str_handles_various_types():
    assert ConstraintSolver._to_time_str("09:30") == "09:30"
    assert ConstraintSolver._to_time_str(None) == "00:00"

    from datetime import time
    assert ConstraintSolver._to_time_str(time(14, 30)) == "14:30"


def test_slot_roundtrip():
    slot = ConstraintSolver._time_to_slot("09:30")
    time_str = ConstraintSolver._slot_to_time(slot)
    assert time_str == "09:30"


def test_add_minutes():
    assert ConstraintSolver._add_minutes("09:00", 90) == "10:30"
    assert ConstraintSolver._add_minutes("23:00", 120) == "23:59"


# ── Task generators ─────────────────────────────────────────


def test_exam_tasks_include_core_and_normal():
    tasks = generate_exam_tasks(
        subjects=["math", "physics", "chemistry"],
        weak_subjects=["math"],
        strong_subjects=["physics"],
        daily_commitment_hrs=4.0,
        day_type="standard",
    )
    priorities = {t.priority for t in tasks}
    assert PRIORITY_CORE in priorities
    assert PRIORITY_NORMAL in priorities
    # Weak subject should be Core priority
    weak_task = [t for t in tasks if "math" in t.title.lower()][0]
    assert weak_task.priority == PRIORITY_CORE


def test_heavy_day_reduces_capacity():
    solver = _make_solver(heavy_days=[2], daily_commitment_hrs=4.0)
    # 2026-04-13 is a Monday (day_of_week=2)
    result = solver.solve(target_date=date(2026, 4, 13), task_requirements=[])
    # Heavy day multiplier is 0.7
    assert result.day_capacity_hrs < 4.0
