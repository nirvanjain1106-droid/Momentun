import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { GoalCard }  from "./molecule-card-goal";
import { PrimaryButton } from "./atom-button-primary";
import { BottomBar } from "./molecule-nav-bottom-bar";
import type { BottomBarTab } from "./molecule-nav-bottom-bar";
import { client } from "../../api/client";

// ─────────────────────────────────────────────────────────────────────────────
// Screen/Goals — 390 × 844 px  ·  Background #FAF6F2
//
// Layer stack:
// ┌──────────────────────────────┐
// │  Status bar       54 px      │  transparent
// ├──────────────────────────────┤
// │  Goals header     56 px      │  "Goals" Bold · "+ New Goal" compact btn
// ├──────────────────────────────┤
// │  Scrollable area  flex-1     │  overflow-y auto · pb 80px
// │   ├─ "Active  3" heading     │  15px Semibold #1A1210
// │   ├─ Goal card × 3           │  Website-Launch · Books · Marathon
// │   └─ Accordion rows × 2      │  Paused · Completed
// ├──────────────────────────────┤
// │  Bottom nav       80 px      │  absolute · Goals active
// └──────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 1.  Status bar (same shell across all screens)
// ─────────────────────────────────────────────────────────────────────────────
function StatusBar() {
  return (
    <div
      aria-hidden="true"
      style={{
        height: "54px", flexShrink: 0,
        display: "flex", alignItems: "flex-end",
        justifyContent: "space-between",
        padding: "0 24px 10px",
        background: "transparent",
      }}
    >
      <span style={{
        fontFamily: "var(--font-sf-pro)", fontSize: "15px",
        fontWeight: "var(--font-weight-semibold)", lineHeight: 1,
        color: "var(--text-primary)", letterSpacing: "-0.01em",
      }}>9:41</span>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {/* Signal bars */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
          <rect x="0"    y="7" width="3" height="5"  rx="0.75" fill="var(--text-primary)" />
          <rect x="4.5"  y="5" width="3" height="7"  rx="0.75" fill="var(--text-primary)" />
          <rect x="9"    y="3" width="3" height="9"  rx="0.75" fill="var(--text-primary)" />
          <rect x="13.5" y="0" width="3" height="12" rx="0.75" fill="var(--text-primary)" />
        </svg>
        {/* Wi-Fi */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path d="M8 9.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" fill="var(--text-primary)" />
          <path d="M3.76 7.05a6 6 0 0 1 8.48 0" stroke="var(--text-primary)" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M1.17 4.46A9.5 9.5 0 0 1 14.83 4.46" stroke="var(--text-primary)" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {/* Battery */}
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="var(--text-primary)" strokeOpacity="0.35" />
          <rect x="22.5" y="3.5" width="2" height="5" rx="1.25" fill="var(--text-primary)" fillOpacity="0.4" />
          <rect x="2" y="2" width="17" height="8" rx="2.25" fill="var(--text-primary)" />
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.  Goals screen header
// ─────────────────────────────────────────────────────────────────────────────
function GoalsHeader({ onNewGoal }: { onNewGoal?: () => void }) {
  return (
    <div
      className="glass-header glass-shine"
      style={{
        position:       "relative",
        height:         "56px",
        flexShrink:     0,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "0 16px",
      }}
    >
      {/* "Goals" — 22px Bold #1A1210 */}
      <span
        style={{
          fontFamily:    "var(--font-sf-pro)",
          fontSize:      "22px",
          fontWeight:    "var(--font-weight-bold)",
          lineHeight:    "var(--text-lh-140)",
          color:         "var(--text-primary)",
          letterSpacing: "-0.2px",
        }}
      >
        Goals
      </span>

      {/* Atom/Button/Primary — compact variant */}
      <PrimaryButton 
        label="+ New Goal" 
        onClick={onNewGoal} 
        style={{ "--btn-height": "36px", "--btn-padding": "0 16px" } as any}
        className="!w-auto"
      />
    </div>
  );
}

interface GoalSummary {
  id: string;
  name: string;
  subtitle: string;
  progress: number;
  status: "success" | "warning" | "error";
  statusLabel: string;
  ringColor: string;
}

const goalColors = ["#E05C7A", "#1A7A4A", "#2E9FD4"];

const getGoalsFromResponse = (data: unknown): Record<string, unknown>[] => {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).goals)) {
    return (data as Record<string, unknown>).goals as Record<string, unknown>[];
  }
  return [];
};

const normalizeGoal = (raw: Record<string, unknown>, index: number): GoalSummary => {
  const rawStatus = String(raw.status ?? "").toLowerCase();
  const progress = Number(raw.progress_pct ?? raw.progress ?? 0);
  const isBehind = rawStatus.includes("behind") || progress < 45;
  const isWarning = rawStatus.includes("slight") || (progress >= 45 && progress < 60);

  return {
    id: String(raw.id ?? `goal-${index}`),
    name: String(raw.name ?? raw.title ?? "Untitled Goal"),
    subtitle: String(raw.subtitle ?? raw.description ?? ""),
    progress,
    status: isBehind ? "error" : isWarning ? "warning" : "success",
    statusLabel: isBehind ? "Behind" : isWarning ? "Slightly Behind" : "On Track",
    ringColor: String(raw.ring_color ?? goalColors[index % goalColors.length]),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4.  Accordion row (Paused / Completed)
// ─────────────────────────────────────────────────────────────────────────────
interface AccordionRowProps {
  label: string;
  count: number;
  /** When true renders a bottom border divider */
  divider?: boolean;
}

function AccordionRow({ label, count, divider = true }: AccordionRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      style={{
        width:          "100%",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "16px 0",
        background:     "transparent",
        border:         "none",
        borderBottom:   divider ? "0.5px solid var(--divider)" : "none",
        cursor:         "pointer",
        textAlign:      "left",
      }}
      aria-expanded={open}
    >
      {/* Left — label: 15px Semibold #6B5C54 */}
      <span
        style={{
          fontFamily:  "var(--font-sf-pro)",
          fontSize:    "15px",
          fontWeight:  "var(--font-weight-semibold)",
          lineHeight:  "var(--text-lh-140)",
          color:       "var(--text-secondary)",
        }}
      >
        {label}
      </span>

      {/* Right — count + chevron: 15px Regular #9C8880 */}
      <span
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        "6px",
          fontFamily: "var(--font-sf-pro)",
          fontSize:   "15px",
          fontWeight: "var(--font-weight-regular)",
          lineHeight: "var(--text-lh-140)",
          color:      "var(--text-muted)",
        }}
      >
        {count}
        <ChevronDown
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          style={{
            color:      "var(--text-muted)",
            transition: "transform 200ms ease",
            transform:  open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5.  Screen/Goals shell
// ─────────────────────────────────────────────────────────────────────────────
export interface ScreenGoalsProps {
  activeTab?:   BottomBarTab;
  onTabChange?: (tab: BottomBarTab) => void;
  onNewGoal?:   () => void;
  onGoalClick?:  (goalId: string) => void;
}

export function ScreenGoals({
  activeTab   = "Goals",
  onTabChange,
  onNewGoal,
  onGoalClick,
}: ScreenGoalsProps) {
  const [_navTab, setNavTab] = useState<BottomBarTab>(activeTab);
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [pausedCount, setPausedCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadGoals = () => {
    client.get('/goals')
      .then((response) => {
        const allGoals = getGoalsFromResponse(response.data);
        const active = allGoals.filter(g => String(g.status ?? '').toLowerCase() === 'active');
        const paused = allGoals.filter(g => String(g.status ?? '').toLowerCase() === 'paused');
        const done = allGoals.filter(g => ['achieved', 'completed', 'abandoned'].includes(String(g.status ?? '').toLowerCase()));
        setGoals(active.map(normalizeGoal));
        setPausedCount(paused.length);
        setCompletedCount(done.length);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadGoals();
  }, []);

  const handleNewGoal = () => {
    const name = window.prompt('Goal name?');
    if (!name) return;
    client.post('/goals', {
      title: name,
      goal_type: 'other',
      target_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    }).then(() => {
      loadGoals();
      onNewGoal?.();
    }).catch(console.error);
  };

  return (
    <div
      style={{
        width:         "390px",
        height:        "844px",
        flexShrink:    0,
        background:    "var(--bg-base)",
        overflow:      "hidden",
        position:      "relative",
        display:       "flex",
        flexDirection: "column",
      }}
    >
      {/* ── 1. Status bar ──────────────────────────────────────────────── */}
      <StatusBar />

      {/* ── 2. Goals header ─────────────────────────────────────────────── */}
      <GoalsHeader onNewGoal={handleNewGoal} />

      {/* ── 3. Scrollable content ───────────────────────────────────────── */}
      <div
        style={{
          flex:          1,
          overflowY:     "auto",
          overflowX:     "hidden",
          padding:       "0 16px",
          paddingBottom: "80px",
          WebkitOverflowScrolling:
            "touch" as React.CSSProperties["WebkitOverflowScrolling"],
        }}
      >
        {/* ── 3a. "Active  3" section heading ──────────────────────────── */}
        <div
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        "6px",
            padding:    "12px 0",
          }}
        >
          {/* "Active" — 15px Semibold #1A1210 */}
          <span
            style={{
              fontFamily:  "var(--font-sf-pro)",
              fontSize:    "15px",
              fontWeight:  "var(--font-weight-semibold)",
              lineHeight:  "var(--text-lh-140)",
              color:       "var(--text-primary)",
            }}
          >
            Active
          </span>
          {/* Count badge — "3" in accent tint pill */}
          <span
            style={{
              fontFamily:   "var(--font-sf-pro)",
              fontSize:     "12px",
              fontWeight:   "var(--font-weight-semibold)",
              lineHeight:   1,
              color:        "var(--accent-primary)",
              background:   "var(--accent-tint)",
              borderRadius: "var(--radius-pill)",
              padding:      "2px 7px",
            }}
          >
            {goals.length}
          </span>
        </div>

        {/* ── 3b. Goal cards — gap 12px ────────────────────────────────── */}
        <div
          style={{
            display:       "flex",
            flexDirection: "column",
            gap:           "12px",
          }}
        >
          {/* 1. Website Launch — 65% / On Track */}
          {loading ? (
            <div style={{
              textAlign: "center",
              padding: "48px 24px",
              color: "#9C8880",
              fontSize: "15px",
            }}>
              Loading goals...
            </div>
          ) : goals.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "48px 24px",
              color: "#9C8880",
              fontSize: "15px",
            }}>
              No goals yet.
            </div>
          ) : goals.map((goal, index) => (
            <button
              key={goal.id}
              type="button"
              onClick={() => onGoalClick?.(goal.id)}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <GoalCard
                goal={index % 3 === 0 ? "Website-Launch" : index % 3 === 1 ? "Books" : "Marathon"}
                name={goal.name}
                subtitle={goal.subtitle}
                percent={goal.progress}
                status={goal.status}
                statusLabel={goal.statusLabel}
              />
            </button>
          ))}

          {/* 2. Read 12 Books — 58% / Slightly Behind */}
          {false && <GoalCard goal="Books" />}

          {/* 3. Run Half Marathon — 40% / Behind */}
          {false && <GoalCard goal="Marathon" />}
        </div>

        {/* ── 3c. Accordion rows ───────────────────────────────────────── */}
        <div style={{ marginTop: "8px" }}>
          {/* Row 1 — Paused · dynamic count */}
          <AccordionRow label="Paused"    count={pausedCount} divider />
          {/* Row 2 — Completed · dynamic count (no bottom border on last row) */}
          <AccordionRow label="Completed" count={completedCount} divider={false} />
        </div>
      </div>

      {/* ── 4. Bottom nav — absolute ────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom:   0, left: 0, right: 0,
          zIndex:   20,
        }}
      >
        <BottomBar
          activeTab={_navTab}
          onTabChange={(tab) => {
            setNavTab(tab);
            onTabChange?.(tab);
          }}
        />
      </div>
    </div>
  );
}
