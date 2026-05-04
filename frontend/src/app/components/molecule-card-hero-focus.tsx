

// ─────────────────────────────────────────────────────────────────────────────
// Molecule/Card/Hero-Focus
// Figma spec:
//   Outer frame: width fill · radius 16px · clip ON · Shadow/Hero-Card
//
//   Layer 1 — Base gradient:  145deg  #D8694A→#B8472A→#A03D22
//   Layer 2 — Shine overlay:  top 45% · 270deg  rgba(fff,0.12)→transparent
//   Layer 3 — Content:        vertical · padding 20px · gap 12px
//     A. Label:   13px Regular rgba(255,255,255,0.80)
//     B. Middle:  Donut chart (80px) + Goal list (vertical, gap 8px)
//        Donut:   3 concentric rings · track rgba(255,255,255,0.20)
//                 center text 18px Bold #FFFFFF
//     C. Footer:  space-between · 12px · rgba(255,255,255,0.80)
//
//   Component properties: label · goals[].name · goals[].percent ·
//                          activeGoalsCount · statusText
// ─────────────────────────────────────────────────────────────────────────────

export interface GoalItem {
  /** Component property: goal display name */
  name: string;
  /** Component property: progress 0-100 */
  percent: number;
  /** CSS color string (token or hex) */
  color: string;
}

const DEFAULT_GOALS: GoalItem[] = [
  { name: "Website Launch", percent: 65, color: "var(--goal-ring-pink)"  }, // #E05C7A
  { name: "Read 12 Books",  percent: 58, color: "var(--goal-ring-green)" }, // #1A7A4A
  { name: "Half Marathon",  percent: 40, color: "var(--goal-ring-teal)"  }, // #2E9FD4
];

// ── Donut Chart ───────────────────────────────────────────────────────────────
// Three concentric rings, each mapped to one goal.
// Rings: r=35/28/21, strokeWidth=4 — inner clear space ≈ 38px ∅ for center text.

interface DonutChartProps {
  goals: GoalItem[];
  size?: number;
}

const RING_CONFIG = [
  { r: 35, sw: 4.5 }, // outer
  { r: 27, sw: 4.5 }, // mid
  { r: 19, sw: 4.5 }, // inner
];

function DonutChart({ goals, size = 80 }: DonutChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const primaryPercent = goals[0]?.percent ?? 65;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ flexShrink: 0 }}
      role="img"
      aria-label={`Goal completion: ${primaryPercent}%`}
    >
      {RING_CONFIG.map((ring, i) => {
        const goal = goals[i];
        if (!goal) return null;
        const circumference = 2 * Math.PI * ring.r;
        const filled        = (goal.percent / 100) * circumference;

        return (
          <g key={i} transform={`rotate(-90 ${cx} ${cy})`}>
            {/* Track — full circle at low opacity */}
            <circle
              cx={cx} cy={cy} r={ring.r}
              fill="none"
              strokeWidth={ring.sw}
              stroke="rgba(255,255,255,0.20)"
            />
            {/* Arc — progress fill */}
            <circle
              cx={cx} cy={cy} r={ring.r}
              fill="none"
              strokeWidth={ring.sw}
              strokeDasharray={`${filled.toFixed(2)} ${circumference.toFixed(2)}`}
              strokeLinecap="round"
              style={{ stroke: goal.color }}
            />
          </g>
        );
      })}

      {/* Center text — 65% / 18px Bold white */}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fill: "var(--text-on-accent)" }}
        fontSize="14"
        fontWeight="700"
        fontFamily="-apple-system, 'SF Pro Display', BlinkMacSystemFont, system-ui, sans-serif"
      >
        {primaryPercent}%
      </text>
    </svg>
  );
}

// ── Main Component ──────��─────────────────────────────────────────────────────

export interface HeroFocusCardProps {
  /** Component property: header label */
  label?: string;
  /** Component property: up to 3 goal items */
  goals?: GoalItem[];
  /** Component property: count shown in footer */
  activeGoalsCount?: number;
  /** Component property: status text shown in footer */
  statusText?: string;
  className?: string;
}

export function HeroFocusCard({
  label            = "Today's Focus",
  goals            = DEFAULT_GOALS,
  activeGoalsCount = 3,
  statusText       = "On track",
  className        = "",
}: HeroFocusCardProps) {
  const displayGoals = goals.slice(0, 3);

  return (
    <div
      className={`w-full relative overflow-hidden ${className}`}
      style={{
        borderRadius: "var(--radius-card)",          // 16px
        boxShadow:    "var(--shadow-hero-card)",

        // Layer 1 (base gradient) + Layer 2 (shine overlay) in one declaration.
        // Shine: 270deg rgba→transparent, 100%×45%, top-left, no-repeat.
        // Base:  145deg #D8694A → #B8472A → #A03D22, full card.
        background: `
          linear-gradient(270deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.00) 100%)
            left top / 100% 45% no-repeat,
          linear-gradient(145deg, var(--gloss-start) 0%, var(--accent-primary) 50%, var(--accent-hover) 100%)
        `,
      }}
    >
      {/* ── Layer 3: Content ────────────────────────────────────────────── */}
      <div
        className="relative flex flex-col"
        style={{ padding: "20px", gap: "12px" }}
      >

        {/* A ── Label ──────────────────────────────────────────────────── */}
        <span
          style={{
            fontFamily: "var(--font-sf-pro)",
            fontSize:   "13px",
            fontWeight: "var(--font-weight-regular)",
            lineHeight: "var(--text-lh-140)",
            color:      "rgba(255,255,255,0.80)",
          }}
        >
          {label}
        </span>

        {/* B ── Middle row: donut + goal list ──────────────────────────── */}
        <div className="flex items-center" style={{ gap: "16px" }}>

          {/* Donut chart — 80px */}
          <DonutChart goals={displayGoals} size={80} />

          {/* Goal list — vertical, gap 8px */}
          <div className="flex flex-col flex-1 min-w-0" style={{ gap: "8px" }}>
            {displayGoals.map((goal, i) => (
              <div key={i} className="flex items-center" style={{ gap: "6px" }}>

                {/* Colored dot 8px */}
                <span
                  aria-hidden="true"
                  style={{
                    width:           "8px",
                    height:          "8px",
                    borderRadius:    "50%",
                    backgroundColor: goal.color,
                    flexShrink:      0,
                  }}
                />

                {/* Goal name — truncated */}
                <span
                  className="flex-1 min-w-0 truncate"
                  style={{
                    fontFamily: "var(--font-sf-pro)",
                    fontSize:   "13px",
                    fontWeight: "var(--font-weight-regular)",
                    lineHeight: "var(--text-lh-140)",
                    color:      "var(--text-on-accent)",   // #FFFFFF on coral bg
                  }}
                >
                  {goal.name}
                </span>

                {/* Percentage value */}
                <span
                  style={{
                    fontFamily: "var(--font-sf-pro)",
                    fontSize:   "13px",
                    fontWeight: "var(--font-weight-semibold)",
                    lineHeight: "var(--text-lh-140)",
                    color:      "var(--text-on-accent)",   // #FFFFFF on coral bg
                    flexShrink: 0,
                  }}
                >
                  {goal.percent}%
                </span>

              </div>
            ))}
          </div>
        </div>

        {/* C ── Footer row: space between ─────────────────────────────── */}
        <div
          className="flex items-center justify-between"
          style={{ paddingTop: "2px" }}
        >
          <span
            style={{
              fontFamily: "var(--font-sf-pro)",
              fontSize:   "var(--text-caption-size)", // 12px
              fontWeight: "var(--font-weight-regular)",
              lineHeight: "var(--text-lh-140)",
              color:      "rgba(255,255,255,0.80)",
            }}
          >
            ⏱ {activeGoalsCount} active goals
          </span>
          <span
            style={{
              fontFamily: "var(--font-sf-pro)",
              fontSize:   "var(--text-caption-size)", // 12px
              fontWeight: "var(--font-weight-regular)",
              lineHeight: "var(--text-lh-140)",
              color:      "rgba(255,255,255,0.80)",
            }}
          >
            • {statusText}
          </span>
        </div>

      </div>
    </div>
  );
}