"""Constraint Solver edge-case stressors."""

import pytest
from datetime import date
from app.services.constraint_solver import (
    ConstraintSolver, FixedBlockData, TaskRequirement, GoalTaskGroup
)

@pytest.fixture
def base_solver_params():
    return {
        "fixed_blocks": [],
        "peak_energy_start": "09:00",
        "peak_energy_end": "12:00",
        "wake_time": "07:00",
        "sleep_time": "23:00",
        "daily_commitment_hrs": 8.0,
        "heavy_days": [],
        "light_days": [],
        "chronotype": "intermediate",
    }

def test_solver_zero_capacity_handles_gracefully(base_solver_params):
    """If user has no free time, all tasks should be unscheduled."""
    # User sleeps all day
    params = base_solver_params.copy()
    params["wake_time"] = "07:00"
    params["sleep_time"] = "07:00"
    
    solver = ConstraintSolver(**params)
    
    tasks = [
        TaskRequirement(title="Task 1", task_type="focus", duration_mins=60, energy_required="high", priority=1)
    ]
    
    result = solver.solve(target_date=date(2024, 1, 1), task_requirements=tasks)
    
    assert len(result.scheduled_tasks) == 0
    assert len(result.unscheduled_tasks) == 1
    assert result.total_usable_mins == 0


def test_solver_core_priority_arbitration(base_solver_params):
    """Goal Rank 1 Core tasks should be placed before Goal Rank 2 Core tasks when capacity is low."""
    # Narrow usable window (only 60 mins usable)
    # total_mins = 90. 90 * 0.75 (fatigue) - 10 (transition) = 57.5 ~ 57 mins.
    params = base_solver_params.copy()
    params["wake_time"] = "07:00"
    params["sleep_time"] = "08:30"
    params["daily_commitment_hrs"] = 1.0 # 60 mins
    
    solver = ConstraintSolver(**params)
    
    # Two goals, each with a 45-min Core task. Only one fits.
    goal_1 = GoalTaskGroup(
        goal_id="g1", goal_rank=1, goal_title="Goal 1",
        tasks=[TaskRequirement(title="G1 Core", task_type="focus", duration_mins=45, energy_required="medium", priority=1)]
    )
    goal_2 = GoalTaskGroup(
        goal_id="g2", goal_rank=2, goal_title="Goal 2",
        tasks=[TaskRequirement(title="G2 Core", task_type="focus", duration_mins=45, energy_required="medium", priority=1)]
    )
    
    result = solver.solve(target_date=date(2024, 1, 1), goal_task_groups=[goal_1, goal_2])
    
    # Goal 1 should be scheduled, Goal 2 unscheduled
    assert len(result.scheduled_tasks) == 1
    assert result.scheduled_tasks[0].title == "G1 Core"
    assert "g2" in result.unsatisfied_goals


def test_solver_extreme_task_duration(base_solver_params):
    """A task longer than the longest window should be unscheduled."""
    solver = ConstraintSolver(**base_solver_params)
    
    # 12-hour task
    tasks = [
        TaskRequirement(title="Giant Task", task_type="focus", duration_mins=720, energy_required="low", priority=2)
    ]
    
    result = solver.solve(target_date=date(2024, 1, 1), task_requirements=tasks)
    
    assert len(result.scheduled_tasks) == 0
    assert len(result.unscheduled_tasks) == 1


def test_solver_overnight_fixed_blocks(base_solver_params):
    """Verify that a block crossing midnight (e.g. 23:00-06:30) blocks appropriately."""
    # Night shift block
    overnight_block = FixedBlockData(
        title="Night Shift", block_type="work",
        start_time="22:00", end_time="06:00",
        buffer_before=0, buffer_after=0
    )
    
    params = base_solver_params.copy()
    params["fixed_blocks"] = [overnight_block]
    params["wake_time"] = "00:00"
    params["sleep_time"] = "23:59"
    
    solver = ConstraintSolver(**params)
    
    # Timeline should be blocked from 22:00 to 06:00
    # Let's try to place a task at 02:00
    tasks = [
        TaskRequirement(title="Midnight Task", task_type="focus", duration_mins=60, energy_required="low", priority=1)
    ]
    
    result = solver.solve(target_date=date(2024, 1, 1), task_requirements=tasks)
    
    # Task should be scheduled OUTSIDE the 22:00-06:00 window
    for task in result.scheduled_tasks:
        start_val = int(task.scheduled_start.split(":")[0])
        # Should not be between 22 and 6
        assert not (22 <= start_val or start_val < 6)
