"""
Constraint Solver — Phase 2.1 + Commit 3 (Multi-Goal)

Fixes applied:
- #1  Type safety: all time values normalised to "HH:MM" strings on entry
- #2  Overnight fixed blocks (23:00 → 06:30) handled correctly
- #5  3-tier priority: 1=Core(MVP), 2=Normal, 3=Bonus
- #9  50% capacity reduction for exhausted days (replaces task filtering)

Commit 3 additions:
- GoalTaskGroup: groups tasks by goal with rank context
- Two-pass allocator: Pass 1 = best-effort floor per goal (rank order),
  Pass 2 = global rank expenditure of remaining capacity
- ScheduledTask now carries goal_id and goal_rank_snapshot
"""

from dataclasses import dataclass, field
from typing import List, Optional, Tuple
from datetime import date
import math

from app.core.constants import FLOOR_TASKS_PER_GOAL, FLOOR_ENERGY_DEGRADE


# ─────────────────────────────────────────────────────────────
# Priority constants — 3-tier triage system
# ─────────────────────────────────────────────────────────────
PRIORITY_CORE   = 1   # Must do. Minimum viable day.
PRIORITY_NORMAL = 2   # Default. Standard and recovery days.
PRIORITY_BONUS  = 3   # Stretch only. Dropped first on bad days.


# ─────────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────────

@dataclass
class FixedBlockData:
    title: str
    block_type: str
    start_time: str
    end_time: str
    buffer_before: int
    buffer_after: int


@dataclass
class FreeWindow:
    start_time: str
    end_time: str
    duration_mins: int
    usable_mins: int
    energy_level: str
    slot_start: int
    slot_end: int


@dataclass
class TaskRequirement:
    title: str
    task_type: str
    duration_mins: int
    energy_required: str
    priority: int         # 1=Core, 2=Normal, 3=Bonus
    subject: Optional[str] = None


@dataclass
class ScheduledTask:
    title: str
    task_type: str
    scheduled_start: str
    scheduled_end: str
    duration_mins: int
    energy_required: str
    priority: int
    is_mvp_task: bool
    sequence_order: int
    description: str = ""
    subject: Optional[str] = None
    slot_reasons: Optional[List[str]] = None
    # Multi-goal context (Commit 3)
    goal_id: Optional[str] = None
    goal_rank_snapshot: Optional[int] = None


@dataclass
class GoalTaskGroup:
    """Tasks belonging to a single goal, with rank context."""
    goal_id: str              # UUID as string (solver is DB-agnostic)
    goal_rank: int            # 1 = highest priority
    goal_title: str
    tasks: List[TaskRequirement] = field(default_factory=list)


@dataclass
class SolverResult:
    day_of_week: int
    day_type: str
    free_windows: List[FreeWindow]
    total_free_mins: int
    total_usable_mins: int
    scheduled_tasks: List[ScheduledTask]
    unscheduled_tasks: List[TaskRequirement]
    day_capacity_hrs: float
    strategy_hint: str
    # Multi-goal: goals whose floor couldn't be met (Commit 3)
    unsatisfied_goals: List[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────
# Core solver
# ─────────────────────────────────────────────────────────────

class ConstraintSolver:

    SLOTS_PER_DAY      = 48
    SLOT_DURATION_MINS = 30
    FATIGUE_BUFFER     = 0.75
    TRANSITION_MINS    = 10

    def __init__(
        self,
        fixed_blocks: List[FixedBlockData],
        peak_energy_start: str,
        peak_energy_end: str,
        wake_time: str,
        sleep_time: str,
        daily_commitment_hrs: float,
        heavy_days: List[int],
        light_days: List[int],
        chronotype: str,
    ):
        # Fix #1 — normalise ALL time inputs to "HH:MM" string on entry
        self.fixed_blocks = [
            FixedBlockData(
                title=b.title,
                block_type=b.block_type,
                start_time=self._to_time_str(b.start_time),
                end_time=self._to_time_str(b.end_time),
                buffer_before=b.buffer_before,
                buffer_after=b.buffer_after,
            )
            for b in fixed_blocks
        ]
        self.peak_energy_start    = self._to_time_str(peak_energy_start)
        self.peak_energy_end      = self._to_time_str(peak_energy_end)
        self.wake_time            = self._to_time_str(wake_time)
        self.sleep_time           = self._to_time_str(sleep_time)
        self.daily_commitment_hrs = float(daily_commitment_hrs)
        self.heavy_days           = heavy_days or []
        self.light_days           = light_days or []
        self.chronotype           = chronotype

    # ── Public API ────────────────────────────────────────────

    def solve(
        self,
        target_date: date,
        task_requirements: Optional[List[TaskRequirement]] = None,
        goal_task_groups: Optional[List[GoalTaskGroup]] = None,
        day_type: str = "standard",
        checkin_energy: Optional[str] = None,
        yesterday_rating: Optional[str] = None,
    ) -> SolverResult:
        """
        Main solver entry point.
        Accepts either:
          - task_requirements: flat list (single-goal backward compat)
          - goal_task_groups: list of GoalTaskGroup (multi-goal, Commit 3)
        """
        day_of_week = self._get_day_of_week(target_date)

        day_type = self._determine_day_type(
            day_of_week, day_type, checkin_energy, yesterday_rating
        )

        timeline = self._build_timeline()
        timeline = self._block_fixed_commitments(timeline, day_of_week)
        free_windows = self._find_free_windows(timeline, day_of_week)

        total_free_mins   = sum(w.duration_mins for w in free_windows)
        total_usable_mins = sum(w.usable_mins   for w in free_windows)

        # Fix #9 — capacity multiplier replaces task filtering
        capacity_multiplier = self._get_capacity_multiplier(
            day_of_week, day_type, checkin_energy
        )
        effective_capacity_mins = min(
            total_usable_mins,
            int(self.daily_commitment_hrs * 60 * capacity_multiplier)
        )

        unsatisfied_goals: List[str] = []

        if goal_task_groups:
            # Multi-goal path: two-pass allocator
            scheduled, unscheduled, unsatisfied_goals = self._fit_tasks_multi_goal(
                goal_task_groups, free_windows, effective_capacity_mins
            )
        else:
            # Single-goal backward compat
            scheduled, unscheduled = self._fit_tasks(
                task_requirements or [], free_windows, effective_capacity_mins
            )

        strategy_hint = self._build_strategy_hint(
            day_type, day_of_week, checkin_energy,
            yesterday_rating, scheduled, unscheduled
        )

        return SolverResult(
            day_of_week=day_of_week,
            day_type=day_type,
            free_windows=free_windows,
            total_free_mins=total_free_mins,
            total_usable_mins=total_usable_mins,
            scheduled_tasks=scheduled,
            unscheduled_tasks=unscheduled,
            day_capacity_hrs=effective_capacity_mins / 60,
            strategy_hint=strategy_hint,
            unsatisfied_goals=unsatisfied_goals,
        )

    # ── Timeline ──────────────────────────────────────────────

    def _build_timeline(self) -> List[bool]:
        return [True] * self.SLOTS_PER_DAY

    def _block_fixed_commitments(
        self, timeline: List[bool], day_of_week: int
    ) -> List[bool]:
        # Block before wake and after sleep
        wake_slot  = self._time_to_slot(self.wake_time)
        sleep_slot = self._time_to_slot(self.sleep_time)

        for i in range(0, wake_slot):
            timeline[i] = False
        for i in range(sleep_slot, self.SLOTS_PER_DAY):
            timeline[i] = False

        for block in self.fixed_blocks:
            start_slot = self._time_to_slot(block.start_time)
            end_slot   = self._time_to_slot(block.end_time)

            buf_before = math.ceil(block.buffer_before / self.SLOT_DURATION_MINS)
            buf_after  = math.ceil(block.buffer_after  / self.SLOT_DURATION_MINS)

            # Fix #2 — overnight block (e.g. 23:00 → 06:30)
            if start_slot > end_slot:
                # Block from start to end of day
                a_start = max(0, start_slot - buf_before)
                for i in range(a_start, self.SLOTS_PER_DAY):
                    timeline[i] = False
                # Block from start of day to end slot
                a_end = min(self.SLOTS_PER_DAY, end_slot + buf_after)
                for i in range(0, a_end):
                    timeline[i] = False
            else:
                a_start = max(0, start_slot - buf_before)
                a_end   = min(self.SLOTS_PER_DAY, end_slot + buf_after)
                for i in range(a_start, a_end):
                    timeline[i] = False

        return timeline

    def _find_free_windows(
        self, timeline: List[bool], day_of_week: int
    ) -> List[FreeWindow]:
        windows = []
        i = 0
        while i < self.SLOTS_PER_DAY:
            if timeline[i]:
                window_start = i
                while i < self.SLOTS_PER_DAY and timeline[i]:
                    i += 1
                window_end    = i
                duration_mins = (window_end - window_start) * self.SLOT_DURATION_MINS

                if duration_mins < 60:
                    i += 1
                    continue

                start_time   = self._slot_to_time(window_start)
                end_time     = self._slot_to_time(window_end)
                usable_mins  = max(0, int(duration_mins * self.FATIGUE_BUFFER) - self.TRANSITION_MINS)
                energy_level = self._get_energy_level(start_time)

                windows.append(FreeWindow(
                    start_time=start_time,
                    end_time=end_time,
                    duration_mins=duration_mins,
                    usable_mins=usable_mins,
                    energy_level=energy_level,
                    slot_start=window_start,
                    slot_end=window_end,
                ))
            else:
                i += 1
        return windows

    # ── Task fitting ─────────────────────────────────────────

    def _fit_tasks(
        self,
        tasks: List[TaskRequirement],
        windows: List[FreeWindow],
        effective_capacity_mins: int,
    ) -> Tuple[List[ScheduledTask], List[TaskRequirement]]:
        if not windows or not tasks:
            return [], list(tasks)

        energy_order = {"high": 0, "medium": 1, "low": 2}

        # Sort: Core first (priority 1), then by energy
        sorted_tasks = sorted(
            tasks,
            key=lambda t: (t.priority, energy_order.get(t.energy_required, 1))
        )
        sorted_windows = sorted(
            windows,
            key=lambda w: energy_order.get(w.energy_level, 1)
        )

        window_remaining    = {i: w.usable_mins for i, w in enumerate(sorted_windows)}
        window_current_time = {i: w.start_time  for i, w in enumerate(sorted_windows)}

        scheduled            = []
        unscheduled          = []
        total_scheduled_mins = 0
        sequence             = 0

        for task in sorted_tasks:
            # Capacity gate — Core tasks always go first
            if total_scheduled_mins + task.duration_mins > effective_capacity_mins:
                unscheduled.append(task)
                continue

            placed = False
            for idx, window in enumerate(sorted_windows):
                if not self._energy_compatible(task.energy_required, window.energy_level):
                    continue
                if window_remaining[idx] < task.duration_mins:
                    continue

                start = window_current_time[idx]
                end   = self._add_minutes(start, task.duration_mins)

                if self._time_to_slot(end) > window.slot_end:
                    continue

                # Build slot reasoning
                reasons = []
                priority_names = {1: "Core (must-do)", 2: "Normal", 3: "Bonus"}
                reasons.append(
                    f"{priority_names.get(task.priority, 'Normal')} priority task"
                )

                if window.energy_level == "high" and task.energy_required == "high":
                    reasons.append(
                        f"Placed during peak energy window ({window.start_time}–{window.end_time}) "
                        "for maximum concentration"
                    )
                elif window.energy_level == "medium":
                    reasons.append(
                        f"Scheduled in moderate energy window ({window.start_time}–{window.end_time})"
                    )
                elif window.energy_level == "low":
                    reasons.append(
                        f"Light task fits the low-energy evening window ({window.start_time}–{window.end_time})"
                    )

                if task.subject:
                    reasons.append(f"Subject: {task.subject}")

                if task.is_mvp_task if hasattr(task, 'is_mvp_task') else task.priority == PRIORITY_CORE:
                    reasons.append("Scheduled first — Core tasks get priority placement")

                scheduled.append(ScheduledTask(
                    title=task.title,
                    task_type=task.task_type,
                    scheduled_start=start,
                    scheduled_end=end,
                    duration_mins=task.duration_mins,
                    energy_required=task.energy_required,
                    priority=task.priority,
                    is_mvp_task=(task.priority == PRIORITY_CORE),
                    sequence_order=sequence,
                    subject=task.subject,
                    slot_reasons=reasons,
                ))

                window_remaining[idx]    -= (task.duration_mins + self.TRANSITION_MINS)
                window_current_time[idx]  = self._add_minutes(end, self.TRANSITION_MINS)
                total_scheduled_mins     += task.duration_mins
                sequence += 1
                placed = True
                break

            if not placed:
                unscheduled.append(task)

        scheduled.sort(key=lambda t: t.scheduled_start)
        for i, t in enumerate(scheduled):
            t.sequence_order = i

        return scheduled, unscheduled

    def _fit_tasks_multi_goal(
        self,
        goal_groups: List[GoalTaskGroup],
        windows: List[FreeWindow],
        effective_capacity_mins: int,
    ) -> Tuple[List[ScheduledTask], List[TaskRequirement], List[str]]:
        """
        Two-pass allocator for multi-goal scheduling (Commit 3).

        Pass 1 — Best-effort floor (in rank order):
          For each goal (sorted by rank), place 1 Core task.
          If no energy-compatible Core task exists and FLOOR_ENERGY_DEGRADE
          is True, allow one controlled energy mismatch.
          If capacity runs out, lower-ranked goals are dropped.

        Pass 2 — Global rank expenditure:
          Merge all remaining tasks, sort by goal_rank → priority → energy,
          fit greedily into remaining capacity.
        """
        if not windows or not goal_groups:
            all_tasks = [t for g in goal_groups for t in g.tasks]
            return [], all_tasks, [g.goal_id for g in goal_groups]

        energy_order = {"high": 0, "medium": 1, "low": 2}

        sorted_windows = sorted(
            windows,
            key=lambda w: energy_order.get(w.energy_level, 1)
        )

        window_remaining    = {i: w.usable_mins for i, w in enumerate(sorted_windows)}
        window_current_time = {i: w.start_time  for i, w in enumerate(sorted_windows)}

        scheduled: List[ScheduledTask] = []
        unsatisfied_goals: List[str]   = []
        total_scheduled_mins           = 0
        sequence                       = 0

        # Track which tasks have been placed (by id in list)
        placed_tasks: set = set()

        # ── Pass 1: Best-effort floor per goal (rank order) ──
        sorted_groups = sorted(goal_groups, key=lambda g: g.goal_rank)

        for group in sorted_groups:
            # Capacity gate: if we've already hit the limit, lower-ranked goals lose their floor
            if total_scheduled_mins >= effective_capacity_mins:
                unsatisfied_goals.append(group.goal_id)
                continue

            # Find Core tasks for this goal
            core_tasks = [
                t for t in group.tasks if t.priority == PRIORITY_CORE
            ]
            if not core_tasks:
                # No Core task defined — try any task
                core_tasks = list(group.tasks)
            if not core_tasks:
                unsatisfied_goals.append(group.goal_id)
                continue

            floor_placed = False
            for floor_task in core_tasks:
                if total_scheduled_mins + floor_task.duration_mins > effective_capacity_mins:
                    continue

                # Try energy-compatible placement first
                result = self._try_place_task(
                    floor_task, sorted_windows, window_remaining,
                    window_current_time, energy_strict=True,
                    goal_id=group.goal_id, goal_rank=group.goal_rank,
                    sequence=sequence,
                )
                if result:
                    scheduled.append(result)
                    total_scheduled_mins += floor_task.duration_mins
                    sequence += 1
                    placed_tasks.add(id(floor_task))
                    floor_placed = True
                    break

                # Energy fallback: allow one mismatch if policy permits
                if FLOOR_ENERGY_DEGRADE:
                    result = self._try_place_task(
                        floor_task, sorted_windows, window_remaining,
                        window_current_time, energy_strict=False,
                        goal_id=group.goal_id, goal_rank=group.goal_rank,
                        sequence=sequence,
                    )
                    if result:
                        result.slot_reasons = (result.slot_reasons or []) + [
                            "Energy mismatch allowed for goal floor guarantee"
                        ]
                        scheduled.append(result)
                        total_scheduled_mins += floor_task.duration_mins
                        sequence += 1
                        placed_tasks.add(id(floor_task))
                        floor_placed = True
                        break

            if not floor_placed:
                unsatisfied_goals.append(group.goal_id)

        # ── Pass 2: Global rank expenditure ──
        remaining_tasks = []
        for group in sorted_groups:
            for task in group.tasks:
                if id(task) not in placed_tasks:
                    remaining_tasks.append((group.goal_rank, group.goal_id, task))

        # Sort: goal_rank ASC → priority ASC → energy order
        remaining_tasks.sort(
            key=lambda x: (x[0], x[2].priority, energy_order.get(x[2].energy_required, 1))
        )

        unscheduled: List[TaskRequirement] = []

        for goal_rank, goal_id, task in remaining_tasks:
            if total_scheduled_mins + task.duration_mins > effective_capacity_mins:
                unscheduled.append(task)
                continue

            result = self._try_place_task(
                task, sorted_windows, window_remaining,
                window_current_time, energy_strict=True,
                goal_id=goal_id, goal_rank=goal_rank,
                sequence=sequence,
            )
            if not result:
                # Try without energy constraint in Pass 2
                result = self._try_place_task(
                    task, sorted_windows, window_remaining,
                    window_current_time, energy_strict=False,
                    goal_id=goal_id, goal_rank=goal_rank,
                    sequence=sequence,
                )
            if result:
                scheduled.append(result)
                total_scheduled_mins += task.duration_mins
                sequence += 1
            else:
                unscheduled.append(task)

        # Final sort by time
        scheduled.sort(key=lambda t: t.scheduled_start)
        for i, t in enumerate(scheduled):
            t.sequence_order = i

        return scheduled, unscheduled, unsatisfied_goals

    def _try_place_task(
        self,
        task: TaskRequirement,
        sorted_windows: List[FreeWindow],
        window_remaining: dict,
        window_current_time: dict,
        energy_strict: bool,
        goal_id: Optional[str] = None,
        goal_rank: Optional[int] = None,
        sequence: int = 0,
    ) -> Optional[ScheduledTask]:
        """Try to place a single task into the best available window."""
        for idx, window in enumerate(sorted_windows):
            if energy_strict and not self._energy_compatible(
                task.energy_required, window.energy_level
            ):
                continue
            if window_remaining[idx] < task.duration_mins:
                continue

            start = window_current_time[idx]
            end   = self._add_minutes(start, task.duration_mins)

            if self._time_to_slot(end) > window.slot_end:
                continue

            # Build slot reasoning
            reasons = []
            priority_names = {1: "Core (must-do)", 2: "Normal", 3: "Bonus"}
            reasons.append(
                f"{priority_names.get(task.priority, 'Normal')} priority task"
            )

            if window.energy_level == "high" and task.energy_required == "high":
                reasons.append(
                    f"Placed during peak energy window ({window.start_time}–{window.end_time}) "
                    "for maximum concentration"
                )
            elif window.energy_level == "medium":
                reasons.append(
                    f"Scheduled in moderate energy window ({window.start_time}–{window.end_time})"
                )
            elif window.energy_level == "low":
                reasons.append(
                    f"Light task fits the low-energy evening window ({window.start_time}–{window.end_time})"
                )

            if task.subject:
                reasons.append(f"Subject: {task.subject}")

            if task.priority == PRIORITY_CORE:
                reasons.append("Scheduled first — Core tasks get priority placement")

            result = ScheduledTask(
                title=task.title,
                task_type=task.task_type,
                scheduled_start=start,
                scheduled_end=end,
                duration_mins=task.duration_mins,
                energy_required=task.energy_required,
                priority=task.priority,
                is_mvp_task=(task.priority == PRIORITY_CORE),
                sequence_order=sequence,
                subject=task.subject,
                slot_reasons=reasons,
                goal_id=goal_id,
                goal_rank_snapshot=goal_rank,
            )

            window_remaining[idx]    -= (task.duration_mins + self.TRANSITION_MINS)
            window_current_time[idx]  = self._add_minutes(end, self.TRANSITION_MINS)
            return result

        return None

    # ── Day type ──────────────────────────────────────────────

    def _determine_day_type(
        self,
        day_of_week: int,
        requested_type: str,
        checkin_energy: Optional[str],
        yesterday_rating: Optional[str],
    ) -> str:
        if checkin_energy and yesterday_rating:
            if checkin_energy == "exhausted":
                return "minimum_viable"   # 50% capacity
            if yesterday_rating == "barely_survived":
                return "recovery"         # 60% capacity
            if checkin_energy == "high" and yesterday_rating == "crushed_it":
                return "stretch"          # 120% capacity
        return requested_type

    def _get_capacity_multiplier(
        self,
        day_of_week: int,
        day_type: str,
        checkin_energy: Optional[str] = None,
    ) -> float:
        """
        Fix #9 — 50% for exhausted/minimum_viable (Google Doc pattern).
        No task filtering — capacity reduction handles everything.
        """
        base = {
            "standard":       1.0,
            "stretch":        1.2,
            "minimum_viable": 0.5,
            "recovery":       0.6,
            "compressed":     0.5,
        }.get(day_type, 1.0)

        if day_of_week in self.heavy_days:
            base *= 0.7
        elif day_of_week in self.light_days:
            base *= 1.15

        return base

    # ── Energy ────────────────────────────────────────────────

    def _get_energy_level(self, time_str: str) -> str:
        slot       = self._time_to_slot(time_str)
        peak_start = self._time_to_slot(self.peak_energy_start)
        peak_end   = self._time_to_slot(self.peak_energy_end)
        wake_slot  = self._time_to_slot(self.wake_time)

        if peak_start <= slot < peak_end:
            return "high"
        if 26 <= slot <= 30:
            return "low"
        if slot >= 42:
            return "low"
        if wake_slot <= slot < wake_slot + 2:
            return "medium"
        return "medium"

    def _energy_compatible(self, task_energy: str, window_energy: str) -> bool:
        order = {"high": 3, "medium": 2, "low": 1}
        return order.get(window_energy, 1) >= order.get(task_energy, 1)

    # ── Strategy hint ─────────────────────────────────────────

    def _build_strategy_hint(
        self,
        day_type: str,
        day_of_week: int,
        checkin_energy: Optional[str],
        yesterday_rating: Optional[str],
        scheduled: List[ScheduledTask],
        unscheduled: List[TaskRequirement],
    ) -> str:
        hints = []
        type_hints = {
            "minimum_viable": "Minimum viable day — 50% capacity, only Core tasks fit.",
            "recovery":       "Recovery day — 60% capacity, Core + Normal tasks.",
            "stretch":        "Stretch day — 120% capacity, all tasks including Bonus.",
        }
        if day_type in type_hints:
            hints.append(type_hints[day_type])
        if checkin_energy == "exhausted":
            hints.append("User reported exhaustion — capacity automatically halved.")
        elif checkin_energy == "high":
            hints.append("User reported high energy.")
        if yesterday_rating == "barely_survived":
            hints.append("Yesterday was very difficult.")
        elif yesterday_rating == "crushed_it":
            hints.append("Great yesterday — build on momentum.")
        if unscheduled:
            titles = [t.title for t in unscheduled[:3]]
            hints.append(f"Parked (didn't fit): {', '.join(titles)}")
        day_names = {
            1: "Sunday", 2: "Monday", 3: "Tuesday", 4: "Wednesday",
            5: "Thursday", 6: "Friday", 7: "Saturday"
        }
        hints.append(f"Today is {day_names.get(day_of_week, 'a weekday')}.")
        return " ".join(hints)

    # ── Time utilities ────────────────────────────────────────

    @staticmethod
    def _to_time_str(t) -> str:
        """Fix #1 — safely convert any time type to 'HH:MM' string."""
        if t is None:
            return "00:00"
        if isinstance(t, str):
            return t
        if hasattr(t, "hour") and hasattr(t, "minute"):
            return f"{t.hour:02d}:{t.minute:02d}"
        return str(t)

    @staticmethod
    def _time_to_slot(time_str) -> int:
        """Convert 'HH:MM' (or datetime.time) to slot index 0-47."""
        try:
            if hasattr(time_str, "hour"):
                return (time_str.hour * 60 + time_str.minute) // 30
            parts  = str(time_str).split(":")
            hour   = int(parts[0])
            minute = int(parts[1])
            return (hour * 60 + minute) // 30
        except (IndexError, ValueError, AttributeError):
            return 0

    @staticmethod
    def _slot_to_time(slot: int) -> str:
        slot       = max(0, min(47, slot))
        total_mins = slot * 30
        return f"{total_mins // 60:02d}:{total_mins % 60:02d}"

    @staticmethod
    def _add_minutes(time_str, minutes: int) -> str:
        try:
            parts = str(time_str).split(":")
            total = int(parts[0]) * 60 + int(parts[1]) + minutes
            total = min(total, 23 * 60 + 59)
            return f"{total // 60:02d}:{total % 60:02d}"
        except (IndexError, ValueError):
            return str(time_str)

    @staticmethod
    def _get_day_of_week(target_date: date) -> int:
        """1=Sun, 2=Mon … 7=Sat"""
        return (target_date.weekday() + 2) % 7 or 7


# ─────────────────────────────────────────────────────────────
# Goal-specific task generators — Fix #5: 3-tier priority
# ─────────────────────────────────────────────────────────────

def generate_exam_tasks(
    subjects: List[str],
    weak_subjects: List[str],
    strong_subjects: List[str],
    daily_commitment_hrs: float,
    day_type: str,
) -> List[TaskRequirement]:
    tasks      = []
    total_mins = int(daily_commitment_hrs * 60)

    weak_mins_each   = 0
    strong_mins_each = 0

    if weak_subjects:
        weak_mins_each = max(30, min(90, int(total_mins * 0.50) // len(weak_subjects)))
    if strong_subjects:
        strong_mins_each = max(30, min(60, int(total_mins * 0.30) // len(strong_subjects)))

    for subject in weak_subjects:
        tasks.append(TaskRequirement(
            title=f"{subject} — Deep Study",
            task_type="deep_study",
            duration_mins=weak_mins_each,
            energy_required="high",
            priority=PRIORITY_CORE,
            subject=subject,
        ))

    for subject in strong_subjects:
        tasks.append(TaskRequirement(
            title=f"{subject} — Practice",
            task_type="practice",
            duration_mins=strong_mins_each,
            energy_required="medium",
            priority=PRIORITY_NORMAL,
            subject=subject,
        ))

    other_subjects = [
        s for s in subjects
        if s not in weak_subjects and s not in strong_subjects
    ]
    for subject in other_subjects:
        tasks.append(TaskRequirement(
            title=f"{subject} — Study",
            task_type="deep_study",
            duration_mins=45,
            energy_required="medium",
            priority=PRIORITY_NORMAL,
            subject=subject,
        ))

    tasks.append(TaskRequirement(
        title="Quick Revision — Flashcards & PYQs",
        task_type="light_review",
        duration_mins=30,
        energy_required="low",
        priority=PRIORITY_NORMAL,
    ))
    tasks.append(TaskRequirement(
        title="Short Break",
        task_type="break",
        duration_mins=15,
        energy_required="low",
        priority=PRIORITY_BONUS,
    ))

    return tasks


def generate_fitness_tasks(
    goal_type: str,
    equipment: str,
    daily_commitment_hrs: float,
) -> List[TaskRequirement]:
    workout_mins = min(60, int(daily_commitment_hrs * 60 * 0.7))
    return [
        TaskRequirement(
            title="Warm-up & Stretching",
            task_type="exercise",
            duration_mins=15,
            energy_required="medium",
            priority=PRIORITY_CORE,
        ),
        TaskRequirement(
            title=f"Workout — {goal_type.replace('_', ' ').title()}",
            task_type="exercise",
            duration_mins=workout_mins,
            energy_required="high",
            priority=PRIORITY_CORE,
        ),
        TaskRequirement(
            title="Nutrition Tracking & Meal Prep",
            task_type="admin",
            duration_mins=20,
            energy_required="low",
            priority=PRIORITY_NORMAL,
        ),
    ]
