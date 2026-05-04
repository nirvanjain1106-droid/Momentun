
import { CheckCircle2, Clock, Zap } from "lucide-react";
import { DeltaBadge } from "./atom-badge-delta";

// ─────────────────────────────────────────────────────────────────────────────
// Molecule/Card/Stat
// Figma spec:
//   • Width: fill (used in 3-column grid)
//   • Background: #FFFFFF · Border: 1px #EDE5DE · Radius: 16px
//   • Padding: 12px 14px · Vertical auto-layout · Gap: 4px
//   • Shadow: Shadow/Card
//
//   Row 1 — Icon (20px) + Label (12px Regular #9C8880)  · horizontal · gap 4px
//   Row 2 — Value  (18px Bold    #1A1210)
//   Row 3 — Delta  (11px Semibold, color varies)
//
// Variants / component properties:
//   Type = Tasks-Done | Focus-Time | Energy-Score
//   label, value, delta — all overridable as component properties
// ─────────────────────────────────────────────────────────────────────────────

export type StatCardType = "Tasks-Done" | "Focus-Time" | "Energy-Score";

interface VariantDef {
  Icon: React.ElementType;
  iconColor: string;
  defaultLabel: string;
  defaultValue: string;
  defaultDelta: string;
  defaultDeltaColor: string;
}

const VARIANTS: Record<StatCardType, VariantDef> = {
  "Tasks-Done": {
    Icon: CheckCircle2,
    iconColor: "#4A90D9",                   // custom blue (not in tokens)
    defaultLabel: "Tasks",
    defaultValue: "8 / 12",
    defaultDelta: "+2 from yesterday",
    defaultDeltaColor: "var(--status-success)",     // #1A7A4A
  },
  "Focus-Time": {
    Icon: Clock,
    iconColor: "var(--text-secondary)",     // #6B5C54
    defaultLabel: "Focus",
    defaultValue: "4h 28m",
    defaultDelta: "+30m from yesterday",
    defaultDeltaColor: "var(--status-success)",
  },
  "Energy-Score": {
    Icon: Zap,
    iconColor: "var(--status-energy)",      // #D4920A
    defaultLabel: "Energy",
    defaultValue: "85 / 100",
    defaultDelta: "High",
    defaultDeltaColor: "var(--status-success)",
  },
};

export interface StatCardProps {
  /** Component property: which variant */
  type: StatCardType;
  /** Component property: override label text */
  label?: string;
  /** Component property: override value text */
  value?: string;
  /** Component property: override delta text */
  delta?: string;
  /** Component property: override delta color */
  deltaColor?: string;
  /** Component property: override delta direction */
  deltaDirection?: "up" | "down";
  className?: string;
}

export function StatCard({
  type,
  label,
  value,
  delta,
  deltaColor,
  deltaDirection = "up",
  className = "",
}: StatCardProps) {
  const { Icon, iconColor, defaultLabel, defaultValue, defaultDelta, defaultDeltaColor } =
    VARIANTS[type];

  const displayLabel = label ?? defaultLabel;
  const displayValue = value ?? defaultValue;
  const displayDelta = delta ?? defaultDelta;
  const displayDeltaColor = deltaColor ?? defaultDeltaColor;

  return (
    <div
      className={`flex flex-col w-full ${className}`}
      style={{
        background: "var(--surface-card)",            // #FFFFFF
        border: "1px solid var(--surface-border)", // #EDE5DE
        borderRadius: "var(--radius-card)",              // 16px
        padding: "12px 14px",
        gap: "4px",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* ── Row 1: Icon + Label ────────────────────────────────────────────── */}
      <div className="flex items-center" style={{ gap: "4px" }}>
        <Icon
          size={20}
          strokeWidth={1.75}
          aria-hidden="true"
          style={{ color: iconColor, flexShrink: 0 }}
        />
        <span
          style={{
            fontFamily: "var(--font-sf-pro)",
            fontSize: "var(--text-caption-size)",   // 12px
            fontWeight: "var(--font-weight-regular)",  // 400
            lineHeight: "var(--text-lh-140)",
            color: "var(--text-muted)",           // #9C8880
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {displayLabel}
        </span>
      </div>

      {/* ── Row 2: Value ───────────────────────────────────────────────────── */}
      <span
        style={{
          fontFamily: "var(--font-sf-pro)",
          fontSize: "18px",                          // no token — spec exact
          fontWeight: "var(--font-weight-bold)",        // 700
          lineHeight: "var(--text-lh-120)",
          color: "var(--text-primary)",            // #1A1210
        }}
      >
        {displayValue}
      </span>

      {/* ── Row 3: Delta ───────────────────────────────────────────────────── */}
      <DeltaBadge
        direction={deltaDirection}
        label={displayDelta}
        color={displayDeltaColor}
      />
    </div>
  );
}
