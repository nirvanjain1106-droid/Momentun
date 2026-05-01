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
