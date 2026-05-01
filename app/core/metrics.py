"""
Prometheus metrics — Sprint 7

P2#7 Fix: Low-cardinality labels only. Use ``outcome`` label (not rule_id or
goal_id) to avoid cardinality explosions. Sample per-rule details at 1% via
distributed tracing (OpenTelemetry), NOT metrics.
"""

from prometheus_client import Counter, Histogram

# ─────────────────────────────────────────────────────────────
# Recurring task dedup metrics
# ─────────────────────────────────────────────────────────────

recurring_dedup_total = Counter(
    "recurring_dedup_total",
    "Recurring task dedup outcomes",
    ["outcome"],  # outcome: "precheck_hit", "index_blocked", "created"
)

recurring_dedup_precheck_hit = Counter(
    "recurring_dedup_precheck_hit_total",
    "Number of recurring task requirements skipped by the pre-check "
    "NOT EXISTS query (task already exists for this rule+date).",
    ["user_id"],   # low-cardinality label only
)

recurring_dedup_index_blocked = Counter(
    "recurring_dedup_index_blocked_total",
    "Number of recurring task inserts blocked by the unique index "
    "uq_task_per_rule_per_date (concurrent collision or retry).",
)

# ─────────────────────────────────────────────────────────────
# Schedule generation metrics
# ─────────────────────────────────────────────────────────────

schedule_generation_latency = Histogram(
    "schedule_generation_latency_seconds",
    "End-to-end schedule generation latency",
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# ─────────────────────────────────────────────────────────────
# Rescue mission metrics
# ─────────────────────────────────────────────────────────────

rescue_evaluation_total = Counter(
    "rescue_evaluation_total",
    "Rescue mission evaluation outcomes",
    ["outcome"],  # outcome: "triggered", "threshold_ok", "no_tasks"
)
