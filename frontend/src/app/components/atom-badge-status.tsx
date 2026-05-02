import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Atom/Badge/Status
// Figma spec:
//   • Height 22px · radius 100px (pill) · padding 2px 8px · gap 4px
//   • 6px dot + 12px Semibold label
//   • Variants: Type=Success | Type=Warning | Type=Error
//   • All color values map 1-to-1 to existing --status-* tokens
// ─────────────────────────────────────────────────────────────────────────────

export type StatusBadgeType = "success" | "warning" | "error";

// ── Per-variant design tokens ─────────────────────────────────────────────────
interface VariantTokens {
  bg: string;
  dot: string;
  text: string;
  defaultLabel: string;
}

const VARIANTS: Record<StatusBadgeType, VariantTokens> = {
  success: {
    bg:           "var(--status-success-bg)",  // #F0FAF4
    dot:          "var(--status-success)",      // #1A7A4A
    text:         "var(--status-success)",      // #1A7A4A
    defaultLabel: "On track",
  },
  warning: {
    bg:           "var(--status-warning-bg)",   // #FEF9EE
    dot:          "var(--status-warning)",       // #C47F1A
    text:         "var(--status-warning)",       // #C47F1A
    defaultLabel: "Slightly behind",
  },
  error: {
    bg:           "var(--status-error-bg)",     // #FEF0EE
    dot:          "var(--status-error)",         // #C0392B
    text:         "var(--status-error)",         // #C0392B
    defaultLabel: "Behind",
  },
};

// ── Component props ───────────────────────────────────────────────────────────
export interface StatusBadgeProps {
  /** Component property: which variant to render */
  type: StatusBadgeType;
  /** Component property: override the label text */
  label?: string;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function StatusBadge({ type, label, className = "" }: StatusBadgeProps) {
  const tokens = VARIANTS[type];
  const displayLabel = label ?? tokens.defaultLabel;

  return (
    <div
      className={`inline-flex items-center ${className}`}
      style={{
        height:       "22px",
        borderRadius: "var(--radius-pill)",   // 100px
        padding:      "2px 8px",
        gap:          "4px",
        background:   tokens.bg,
      }}
    >
      {/* 6px status dot */}
      <span
        aria-hidden="true"
        style={{
          width:        "6px",
          height:       "6px",
          borderRadius: "50%",
          background:   tokens.dot,
          flexShrink:   0,
        }}
      />

      {/* Label — Text/Caption metrics + Semibold weight */}
      <span
        style={{
          fontFamily:  "var(--font-sf-pro)",
          fontSize:    "var(--text-caption-size)",    // 12px
          fontWeight:  "var(--font-weight-semibold)",  // 600
          lineHeight:  "var(--text-lh-140)",            // 1.4
          color:       tokens.text,
          whiteSpace:  "nowrap",
        }}
      >
        {displayLabel}
      </span>
    </div>
  );
}
