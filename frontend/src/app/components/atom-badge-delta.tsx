
import { ArrowUp, ArrowDown } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Atom/Badge/Delta
// Figma spec:
//   • Auto layout horizontal · height auto · gap 3px · center-vertical
//   • No background, no border — purely typographic delta indicator
//   • Variants: Direction=Up (#1A7A4A) | Direction=Down (#C0392B)
//   • Arrow icon: 12px lucide ArrowUp / ArrowDown
//   • Label: 12px Semibold, same color as arrow
// ─────────────────────────────────────────────────────────────────────────────

export type DeltaDirection = "up" | "down";

interface DirectionTokens {
  color: string;
  defaultLabel: string;
}

const DIRECTIONS: Record<DeltaDirection, DirectionTokens> = {
  up: {
    color:        "var(--status-success)", // #1A7A4A
    defaultLabel: "+12% vs last week",
  },
  down: {
    color:        "var(--status-error)",   // #C0392B
    defaultLabel: "-5% vs last week",
  },
};

export interface DeltaBadgeProps {
  /** Component property: which direction variant */
  direction: DeltaDirection;
  /** Component property: override the label text */
  label?: string;
  /** Component property: override the color */
  color?: string;
  className?: string;
}

export function DeltaBadge({ direction, label, color: overrideColor, className = "" }: DeltaBadgeProps) {
  const { color: defaultColor, defaultLabel } = DIRECTIONS[direction];
  const displayLabel = label ?? defaultLabel;
  const color = overrideColor ?? defaultColor;
  const ArrowIcon = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <div
      className={`inline-flex items-center ${className}`}
      style={{ gap: "3px" }}
    >
      {/* Arrow icon — 12px, matches label color */}
      <ArrowIcon
        size={12}
        strokeWidth={2.5}
        style={{ color, flexShrink: 0 }}
        aria-hidden="true"
      />

      {/* Label — Text/Delta style (12px Semibold) */}
      <span
        style={{
          fontFamily: "var(--font-sf-pro)",
          fontSize:   "var(--text-delta-size)",       // 12px
          fontWeight: "var(--font-weight-semibold)",   // 600
          lineHeight: "var(--text-lh-140)",             // 1.4
          color,
          whiteSpace: "nowrap",
        }}
      >
        {displayLabel}
      </span>
    </div>
  );
}
