
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { HeroFocusCard }  from "./molecule-card-hero-focus";
import { StatCard }        from "./molecule-card-stat";
import { AICoachCard }     from "./molecule-card-ai-coach";
import type { ScheduleResponse } from "../../api/scheduleApi";
import type { StreakData } from "../../api/insightsApi";

// ─────────────────────────────────────────────────────────────────────────────
// Screen/Home — Content Sections
//
// Four sections stacked vertically inside the scrollable content area.
// Gap between sections: 12px  (--space-md)
//
// Section 1  Today's Focus     Molecule/Card/Hero-Focus · width fill
// Section 2  Stats Row         3× Molecule/Card/Stat · horizontal · gap 8px
// Section 3  Focus Time Today  White card · 16px padding · recharts AreaChart
// Section 4  AI Coach          Molecule/Card/AI-Coach · width fill
//
// The parent (ScreenHome content area) already supplies:
//   • padding 0 16px   → left/right margins
//   • overflow-y auto  → scroll
//   • paddingBottom 80px → clears the nav bar
// ────────────────────────────────────────────────────────────────────────────

// ── Section 3: Focus Time line-chart data ─────────────────────────────────────
// Shows per-hour focus intensity (not cumulative) through the day.
// The running total at the last block reaches 4h 28m displayed in the header.
const FOCUS_DATA = [
  { time: "6AM",  hours: 0.0 },
  { time: "8AM",  hours: 0.8 },
  { time: "10AM", hours: 3.2 },
  { time: "12PM", hours: 2.4 },
  { time: "2PM",  hours: 1.6 },
  { time: "4PM",  hours: 3.8 },
  { time: "6PM",  hours: 4.1 },
  { time: "8PM",  hours: 2.2 },
  { time: "9PM",  hours: 0.4 },
];

// X-axis ticks rendered by Recharts (subset shown as labels)
const X_TICKS = ["6AM", "12PM", "6PM", "9PM"];
// Y-axis ticks: 0h → 6h
const Y_TICKS = [0, 2, 4, 6];

// Spec values
const CHART_LINE_COLOR  = "#C4603A";  // var(--chart-line)
const CHART_AREA_COLOR  = "rgba(184, 71, 42, 0.08)";   // #B8472A at 8%
const GRID_COLOR        = "#EDE5DE";  // var(--divider)
const AXIS_TICK_COLOR   = "#9C8880";  // var(--text-muted)
const AXIS_TICK_SIZE    = 11;

function FocusTimeCard({ value }: { value: string }) {
  return (
    <div
      style={{
        background:   "var(--surface-card)",
        borderRadius: "var(--radius-card)",
        border:       "1px solid var(--surface-border)",
        boxShadow:    "var(--shadow-card)",
        padding:      "16px",
      }}
    >
      {/* ── Header row ── */}
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          marginBottom:   "10px",
        }}
      >
        <span
          style={{
            fontFamily:  "var(--font-sf-pro)",
            fontSize:    "14px",
            fontWeight:  "var(--font-weight-semibold)",
            color:       "var(--text-primary)",
            lineHeight:  "var(--text-lh-140)",
          }}
        >
          Focus Time (Today)
        </span>
        <span
          style={{
            fontFamily:  "var(--font-sf-pro)",
            fontSize:    "14px",
            fontWeight:  "var(--font-weight-semibold)",
            color:       "var(--accent-primary)",
            lineHeight:  "var(--text-lh-140)",
          }}
        >
          {value}
        </span>
      </div>

      {/* ── Line chart ──
          Container height 108px = 80px chart area + ~20px x-axis row + 8px margin
      */}
      <ResponsiveContainer width="100%" height={108}>
        <AreaChart
          id="home-focus-daily"
          data={FOCUS_DATA}
          margin={{ top: 4, right: 4, bottom: 0, left: -14 }}
        >
          {/* Horizontal grid lines only — 0.5px #EDE5DE */}
          <CartesianGrid
            key="grid"
            horizontal
            vertical={false}
            stroke={GRID_COLOR}
            strokeWidth={0.5}
            strokeDasharray=""
          />

          {/* X axis — 4 visible ticks */}
          <XAxis
            key="x-axis"
            dataKey="time"
            ticks={X_TICKS}
            tick={{
              fontSize:   AXIS_TICK_SIZE,
              fill:       AXIS_TICK_COLOR,
              fontFamily: "var(--font-sf-pro)",
            }}
            tickLine={false}
            axisLine={false}
            dy={4}
          />

          {/* Y axis — 0h, 2h, 4h, 6h */}
          <YAxis
            key="y-axis"
            ticks={Y_TICKS}
            tickFormatter={(v: number) => `${v}h`}
            tick={{
              fontSize:   AXIS_TICK_SIZE,
              fill:       AXIS_TICK_COLOR,
              fontFamily: "var(--font-sf-pro)",
            }}
            tickLine={false}
            axisLine={false}
            width={28}
            domain={[0, 6]}
          />

          {/* Area — stroke #C4603A · fill rgba(184,71,42,0.08) */}
          <Area
            key="area"
            type="monotone"
            dataKey="hours"
            stroke={CHART_LINE_COLOR}
            strokeWidth={2}
            fill={CHART_AREA_COLOR}
            isAnimationActive={false}
            dot={{
              fill:        CHART_LINE_COLOR,
              stroke:      "#FFFFFF",
              strokeWidth: 1.5,
              r:           2.5,
            }}
            activeDot={{
              fill:        CHART_LINE_COLOR,
              stroke:      "#FFFFFF",
              strokeWidth: 1.5,
              r:           3.5,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Exported content wrapper ──────────────────────────────────────────────────
const isCompletedTask = (status: string) => status === "completed" || status === "done";

const formatMinutes = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export interface HomeContentProps {
  schedule?: ScheduleResponse | null;
  streak?: StreakData | null;
  error?: string;
  onChatWithCoach?: () => void;
}

export function HomeContent({
  schedule,
  error,
  onChatWithCoach,
}: HomeContentProps) {
  const completedTasks = schedule?.tasks?.filter((task) => isCompletedTask(task.task_status)).length ?? 0;
  const totalTasks = schedule?.total_tasks ?? schedule?.tasks?.length ?? 0;
  const focusTime = formatMinutes(schedule?.total_study_mins ?? 0);
  const energyScore = `${completedTasks} / 100`;

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        gap:           "12px",          // --space-md between every section
        paddingTop:    "4px",           // small breath below the header
      }}
    >

      {/* ── Section 1: Today's Focus ── */}
      <HeroFocusCard />

      {error && (
        <div style={{
          background: "#FDF2F1",
          border: "1px solid #F5C2C0",
          borderRadius: "12px",
          color: "#C0392B",
          fontFamily: "var(--font-sf-pro)",
          fontSize: "13px",
          padding: "10px 12px",
        }}>
          {error}
        </div>
      )}

      {/* ── Section 2: Stats Row ── */}
      <div
        style={{
          display: "flex",
          gap:     "8px",     // --space-sm between stat cards
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <StatCard type="Tasks-Done" value={`${completedTasks} / ${totalTasks}`} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <StatCard type="Focus-Time" value={focusTime} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <StatCard type="Energy-Score" value={energyScore} />
        </div>
      </div>

      {/* ── Section 3: Focus Time Today ── */}
      <FocusTimeCard value={focusTime} />

      {/* ── Section 4: AI Coach ── */}
      <AICoachCard onCTAClick={onChatWithCoach} />

    </div>
  );
}
