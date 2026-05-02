import React from "react";
import { Clock } from "lucide-react";
import { DeltaBadge } from "./atom-badge-delta";
import type { DeltaDirection } from "./atom-badge-delta";

// ─────────────────────────────────────────────────────────────────────────────
// Molecule/Row/Highlight
// Figma spec:
//   Frame: fill · height 52px · horizontal · space-between · center-vertical
//          bottom-border 0.5px #EDE5DE · padding 8px 0
//
//   LEFT  (horizontal, gap 10px, center vertical):
//     Icon circle  32px · bg #F5E8E4 · icon 16px #B8472A
//     Label col    (vertical, gap 2px)
//       label      13px Regular  #9C8880
//       value      17px Semibold #1A1210
//
//   RIGHT:
//     Atom/Badge/Delta  direction + label text
//
//   Component properties:
//     icon (instance swap) · label · value · deltaDirection · deltaText
// ─────────────────────────────────────────────────────────────────────────────

export interface HighlightRowProps {
  /** Component property: icon (instance swap) — any Lucide component */
  icon?: React.ElementType;
  /** Component property: label text (metric name) */
  label?: string;
  /** Component property: value text */
  value?: string;
  /** Component property: delta direction Up / Down */
  deltaDirection?: DeltaDirection;
  /** Component property: delta label text */
  deltaText?: string;
  /**
   * Optional override for the right slot — replaces DeltaBadge entirely.
   * Use for "On track" (no arrow), sub-text values, or any custom content.
   */
  rightSlot?: React.ReactNode;
  /**
   * When composing a list, set `hideBorder` on the last row so it renders
   * without a bottom divider. Defaults to false (border shown).
   */
  hideBorder?: boolean;
  className?: string;
}

export function HighlightRow({
  icon:          IconComponent = Clock,
  label          = "Focus Time",
  value          = "18h 42m",
  deltaDirection = "up",
  deltaText      = "+12% vs last week",
  rightSlot,
  hideBorder     = false,
  className      = "",
}: HighlightRowProps) {
  return (
    <div
      className={`w-full flex items-center justify-between ${className}`}
      style={{
        height:       "52px",
        padding:      "8px 0",
        // 0.5px bottom divider — box-shadow avoids sub-pixel rendering quirks
        boxShadow:    hideBorder
          ? "none"
          : "0 0.5px 0 0 var(--surface-border)",
      }}
    >

      {/* ── Left: icon circle + label / value ────────────────────────────── */}
      <div className="flex items-center" style={{ gap: "10px" }}>

        {/* 32px icon circle */}
        <div
          aria-hidden="true"
          style={{
            width:           "32px",
            height:          "32px",
            flexShrink:      0,
            borderRadius:    "50%",
            background:      "var(--accent-tint)",   // #F5E8E4
            display:         "flex",
            alignItems:      "center",
            justifyContent:  "center",
          }}
        >
          <IconComponent
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            style={{ color: "var(--accent-primary)" }}  // #B8472A
          />
        </div>

        {/* Label column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>

          {/* Metric name — 13px Regular #9C8880 */}
          <span
            style={{
              fontFamily:  "var(--font-sf-pro)",
              fontSize:    "13px",
              fontWeight:  "var(--font-weight-regular)",
              lineHeight:  "var(--text-lh-120)",
              color:       "var(--text-muted)",
              whiteSpace:  "nowrap",
            }}
          >
            {label}
          </span>

          {/* Metric value — 17px Semibold #1A1210 */}
          <span
            style={{
              fontFamily:  "var(--font-sf-pro)",
              fontSize:    "var(--text-title-2-size)",   // 17px
              fontWeight:  "var(--font-weight-semibold)",
              lineHeight:  "var(--text-lh-120)",
              color:       "var(--text-primary)",
              whiteSpace:  "nowrap",
            }}
          >
            {value}
          </span>

        </div>
      </div>

      {/* ── Right: custom slot OR Atom/Badge/Delta ────────────────────────── */}
      {rightSlot !== undefined
        ? rightSlot
        : <DeltaBadge direction={deltaDirection} label={deltaText} />}

    </div>
  );
}