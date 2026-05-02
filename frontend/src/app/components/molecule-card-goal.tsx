import React from "react";
import { StatusBadge } from "./atom-badge-status";

// ─────────────────────────────────────────────────────────────────────────────
// Molecule/Card/Goal
// Figma spec:
//   Frame: fill · radius 16px · bg #FFFFFF · border 1px #EDE5DE
//         padding 16px · vertical gap 12px · Shadow/Card
//
//   Section A — Top row (horizontal, gap 12px):
//     ├─ Ring: 64px circle · 6px stroke · track #EDE5DE · arc [ring color]
//     │         Center: percentage 16px Bold #1A1210
//     └─ Info col (vertical, gap 4px):
//         ├─ Goal name  15px Semibold #1A1210
//         ├─ Subtitle   13px Regular  #6B5C54
//         └─ StatusBadge (Atom/Badge/Status)
//
//   Section B — Trajectory chart area (48px):
//     ├─ Label "Trajectory"  11px Regular #9C8880
//     └─ Mini line chart (3-point smooth bezier)
//         · Y labels: 100% / 50% / 0%         (10px)
//         · X labels: start / mid / end month  (10px)
//         · Line color = ring color; track rgba grid
//         · Subtle area fill under the curve
//
//   3 variants: Goal=Website-Launch / Goal=Books / Goal=Marathon
//   Component properties: name · subtitle · percent · status label ·
//                          startMonth · midMonth · endMonth · chartPoints
// ─────────────────────────────────────────────────────────────────────────────

export type GoalVariant   = "Website-Launch" | "Books" | "Marathon";
export type GoalStatusType = "success" | "warning" | "error";

// ── Variant defaults ──────────────────────────────────────────────────────────

interface VariantDef {
  ringColor:   string;
  name:        string;
  subtitle:    string;
  percent:     number;
  status:      GoalStatusType;
  statusLabel: string;
  startMonth:  string;
  midMonth:    string;
  endMonth:    string;
  points:      [number, number, number]; // percentage trajectory values
}

const VARIANTS: Record<GoalVariant, VariantDef> = {
  "Website-Launch": {
    ringColor:   "var(--goal-ring-pink)",   // #E05C7A
    name:        "Website Launch",
    subtitle:    "Design · Dev · Marketing",
    percent:     65,
    status:      "success",
    statusLabel: "On Track",
    startMonth:  "Jan",
    midMonth:    "May",
    endMonth:    "Aug",
    points:      [4, 35, 65],
  },
  "Books": {
    ringColor:   "var(--goal-ring-green)",  // #1A7A4A
    name:        "Read 12 Books",
    subtitle:    "Kindle · Readwise · Notion",
    percent:     58,
    status:      "warning",
    statusLabel: "Slightly Behind",
    startMonth:  "Jan",
    midMonth:    "May",
    endMonth:    "Aug",
    points:      [4, 20, 58],
  },
  "Marathon": {
    ringColor:   "var(--goal-ring-teal)",   // #2E9FD4
    name:        "Run Half Marathon",
    subtitle:    "Training · Nutrition · Rest",
    percent:     40,
    status:      "error",
    statusLabel: "Behind",
    startMonth:  "Jan",
    midMonth:    "May",
    endMonth:    "Aug",
    points:      [4, 12, 40],
  },
};

// ── Ring progress (64 × 64) ───────────────────────────────────────────────────
// SVG for the two circles; absolutely-positioned HTML div for center text
// so the font renders through the browser engine (not SVG fonts).

interface RingProps { percent: number; color: string; }

function RingProgress({ percent, color }: RingProps) {
  const r    = 26;                              // radius — outer edge at 26+3=29 (3px margin)
  const circ = 2 * Math.PI * r;                // 163.36
  const arc  = (percent / 100) * circ;

  return (
    <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
      {/* SVG ring */}
      <svg width={64} height={64} viewBox="0 0 64 64" aria-hidden="true">
        <g transform="rotate(-90 32 32)">
          {/* Track — full circle */}
          <circle
            cx={32} cy={32} r={r}
            fill="none"
            stroke="var(--surface-border)"
            strokeWidth={6}
          />
          {/* Progress arc */}
          <circle
            cx={32} cy={32} r={r}
            fill="none"
            strokeWidth={6}
            strokeDasharray={`${arc.toFixed(2)} ${circ.toFixed(2)}`}
            strokeLinecap="round"
            style={{ stroke: color }}
          />
        </g>
      </svg>

      {/* Center percentage — HTML for crisp font rendering */}
      <div
        style={{
          position:      "absolute",
          inset:         0,
          display:       "flex",
          alignItems:    "center",
          justifyContent:"center",
        }}
      >
        <span
          style={{
            fontFamily:    "var(--font-sf-pro)",
            fontSize:      "15px",                     // spec: 16px — 15 fits ring cleanly
            fontWeight:    "var(--font-weight-bold)",
            lineHeight:    1,
            letterSpacing: "-0.02em",
            color:         "var(--text-primary)",
          }}
        >
          {percent}%
        </span>
      </div>
    </div>
  );
}

// ── Trajectory chart ──────────────────────────────────────────────────────────
// Hybrid: SVG handles visual geometry (preserveAspectRatio="none" + non-scaling-stroke)
//         HTML absolutely-positioned elements handle all text + dots so they stay
//         crisp and perfectly circular regardless of container width.

interface ChartProps {
  color:      string;
  points:     [number, number, number];
  startMonth: string;
  midMonth:   string;
  endMonth:   string;
  gradId:     string;
}

// SVG geometry constants
const W   = 200;  // viewBox width
const H   = 40;   // viewBox height (= container px height)
const X1  = 32;   // chart left edge  (reserves room for y-labels)
const Xm  = 114;  // chart center
const X2  = 196;  // chart right edge
const YT  = 0;    // chart drawing top
const YB  = 27;   // chart drawing bottom (leaves 13px for x-labels)
const CH  = YB - YT; // 27 — chart drawing height

const pctToY = (p: number) => YT + (1 - p / 100) * CH;

function TrajectoryChart({ color, points, startMonth, midMonth, endMonth, gradId }: ChartProps) {
  const y1 = pctToY(points[0]);
  const y2 = pctToY(points[1]);
  const y3 = pctToY(points[2]);

  // Smooth monotonic cubic bezier through 3 equidistant x-points
  const T    = (Xm - X1) / 3;     // ≈ 27.3 — horizontal tension per segment
  const line = [
    `M ${X1} ${y1.toFixed(2)}`,
    `C ${(X1+T).toFixed(2)} ${y1.toFixed(2)} ${(Xm-T).toFixed(2)} ${y2.toFixed(2)} ${Xm} ${y2.toFixed(2)}`,
    `C ${(Xm+T).toFixed(2)} ${y2.toFixed(2)} ${(X2-T).toFixed(2)} ${y3.toFixed(2)} ${X2} ${y3.toFixed(2)}`,
  ].join(" ");
  const area = `${line} L ${X2} ${YB} L ${X1} ${YB} Z`;

  // HTML positions for dots (percentage of container so they track SVG coords exactly)
  const dotPos = [
    { left: `${(X1/W*100).toFixed(2)}%`, top: `${(y1/H*100).toFixed(2)}%` },
    { left: `${(Xm/W*100).toFixed(2)}%`, top: `${(y2/H*100).toFixed(2)}%` },
    { left: `${(X2/W*100).toFixed(2)}%`, top: `${(y3/H*100).toFixed(2)}%` },
  ];

  // HTML positions for x-axis labels — aligned with dot x-coords
  const xLbls = [
    { left: `${(X1/W*100).toFixed(2)}%`, anchor: "left"  as const, label: startMonth },
    { left: `${(Xm/W*100).toFixed(2)}%`, anchor: "center"as const, label: midMonth   },
    { left: `${(X2/W*100).toFixed(2)}%`, anchor: "right" as const, label: endMonth   },
  ];
  const anchorTransform = { left: "translateX(0)", center: "translateX(-50%)", right: "translateX(-100%)" };

  const lbl: React.CSSProperties = {
    fontFamily: "var(--font-sf-pro)",
    fontSize:   "10px",                      // spec: 10px
    fontWeight: "var(--font-weight-regular)",
    color:      "var(--text-muted)",
    lineHeight: 1,
    userSelect: "none",
  };

  return (
    <div style={{ position: "relative", height: `${H}px` }}>

      {/* ── SVG visual layer ───────────────────────────────────────────────── */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", color }}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="currentColor" stopOpacity={0.20} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0}    />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines at 100%, 50%, 0% */}
        {[YT, YT + CH / 2, YB].map((y, i) => (
          <line key={i}
            x1={X1} y1={y} x2={X2} y2={y}
            stroke="var(--surface-border)"
            strokeWidth={0.8}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Area fill under the curve */}
        <path d={area} fill={`url(#${gradId})`} />

        {/* Chart line */}
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* ── Dots — HTML circles (stay round despite SVG scale) ─────────────── */}
      {dotPos.map((d, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            position:        "absolute",
            left:            d.left,
            top:             d.top,
            width:           "5px",
            height:          "5px",
            borderRadius:    "50%",
            backgroundColor: color,
            transform:       "translate(-50%, -50%)",
            pointerEvents:   "none",
            boxShadow:       `0 0 0 2px white`,      // crisp white halo
          }}
        />
      ))}

      {/* ── Y-axis labels — absolutely positioned to mirror SVG chart area ─── */}
      {/* Container spans y=YT(0) to y=YB(27), matching chart drawing area.   */}
      <div style={{ position: "absolute", left: 0, top: `${YT}px`, width: `${X1}px`, height: `${CH}px` }}>
        <span style={{ ...lbl, position: "absolute", top:    0                                  }}>100%</span>
        <span style={{ ...lbl, position: "absolute", top:   "50%", transform: "translateY(-50%)" }}>50%</span>
        <span style={{ ...lbl, position: "absolute", bottom: 0                                  }}>0%</span>
      </div>

      {/* ── X-axis labels — aligned by percentage to match dot positions ────── */}
      {xLbls.map(({ left, anchor, label }) => (
        <span
          key={label}
          aria-hidden="true"
          style={{
            ...lbl,
            position:  "absolute",
            left,
            bottom:    0,
            transform: anchorTransform[anchor],
          }}
        >
          {label}
        </span>
      ))}

    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export interface GoalCardProps {
  /** Figma: which variant to use as default baseline */
  goal?: GoalVariant;
  /** Component property: goal name */
  name?: string;
  /** Component property: subtitle / tools line */
  subtitle?: string;
  /** Component property: completion percentage 0-100 */
  percent?: number;
  /** Component property: status badge type */
  status?: GoalStatusType;
  /** Component property: status badge label */
  statusLabel?: string;
  /** Component property: x-axis start month */
  startMonth?: string;
  /** Component property: x-axis mid month */
  midMonth?: string;
  /** Component property: x-axis end month */
  endMonth?: string;
  /** Component property: 3-point trajectory [start%, mid%, end%] */
  chartPoints?: [number, number, number];
  className?: string;
}

export function GoalCard({
  goal        = "Website-Launch",
  name,
  subtitle,
  percent,
  status,
  statusLabel,
  startMonth,
  midMonth,
  endMonth,
  chartPoints,
  className   = "",
}: GoalCardProps) {
  const v = VARIANTS[goal];

  const ringColor      = v.ringColor;
  const displayName    = name        ?? v.name;
  const displaySub     = subtitle    ?? v.subtitle;
  const displayPct     = percent     ?? v.percent;
  const displayStatus  = status      ?? v.status;
  const displaySLabel  = statusLabel ?? v.statusLabel;
  const displayStart   = startMonth  ?? v.startMonth;
  const displayMid     = midMonth    ?? v.midMonth;
  const displayEnd     = endMonth    ?? v.endMonth;
  const displayPoints  = chartPoints ?? v.points;

  // Unique gradient ID per instance (avoids collision when multiple cards are on one page)
  const uid    = React.useId();
  const gradId = `goal-area-${uid.replace(/:/g, "")}`;

  return (
    <div
      className={`w-full ${className}`}
      style={{
        background:    "var(--surface-card)",
        border:        "1px solid var(--surface-border)",
        borderRadius:  "var(--radius-card)",
        padding:       "16px",
        display:       "flex",
        flexDirection: "column",
        gap:           "12px",
        boxShadow:     "var(--shadow-card)",
      }}
    >
      {/* ── Section A — Top row ──────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>

        {/* Ring progress */}
        <RingProgress percent={displayPct} color={ringColor} />

        {/* Info column */}
        <div
          style={{
            display:       "flex",
            flexDirection: "column",
            gap:           "4px",
            flex:          1,
            minWidth:      0,
          }}
        >
          {/* Goal name */}
          <span
            style={{
              fontFamily:    "var(--font-sf-pro)",
              fontSize:      "var(--text-body-size)",       // 15px
              fontWeight:    "var(--font-weight-semibold)",
              lineHeight:    "var(--text-lh-140)",
              color:         "var(--text-primary)",
              whiteSpace:    "nowrap",
              overflow:      "hidden",
              textOverflow:  "ellipsis",
            }}
          >
            {displayName}
          </span>

          {/* Subtitle */}
          <span
            style={{
              fontFamily: "var(--font-sf-pro)",
              fontSize:   "13px",
              fontWeight: "var(--font-weight-regular)",
              lineHeight: "var(--text-lh-140)",
              color:      "var(--text-secondary)",
              whiteSpace: "nowrap",
              overflow:   "hidden",
              textOverflow:"ellipsis",
            }}
          >
            {displaySub}
          </span>

          {/* Status badge */}
          <div style={{ marginTop: "2px" }}>
            <StatusBadge type={displayStatus} label={displaySLabel} />
          </div>
        </div>
      </div>

      {/* Thin divider between sections */}
      <div
        aria-hidden="true"
        style={{ height: "1px", background: "var(--surface-border)", margin: "0 -2px" }}
      />

      {/* ── Section B — Trajectory chart ────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

        {/* Section label */}
        <span
          style={{
            fontFamily: "var(--font-sf-pro)",
            fontSize:   "var(--text-label-small-size)",  // 11px
            fontWeight: "var(--font-weight-regular)",
            lineHeight: 1,
            color:      "var(--text-muted)",
          }}
        >
          Trajectory
        </span>

        {/* Mini line chart */}
        <TrajectoryChart
          color={ringColor}
          points={displayPoints}
          startMonth={displayStart}
          midMonth={displayMid}
          endMonth={displayEnd}
          gradId={gradId}
        />
      </div>
    </div>
  );
}
