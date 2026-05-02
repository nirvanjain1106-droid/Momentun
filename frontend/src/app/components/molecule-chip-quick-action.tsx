import React, { useState } from "react";
import { Play } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Molecule/Chip/Quick-Action
// Figma spec:
//   Frame: 160px fixed · horizontal · gap 10px · center-vertical
//          bg #FFFFFF · border 1px #EDE5DE · radius 10px · padding 12px 14px
//
//   LEFT  — 32px circle · bg #F5E8E4 · icon 16px #B8472A
//   RIGHT — Text column, vertical, gap 2px
//             title    13px Semibold #1A1210
//             subtitle 12px Regular  #6B5C54  max 2 lines
//
//   Component properties: icon (instance swap) · title · subtitle
// ─────────────────────────────────────────────────────────────────────────────

export interface QuickActionChipProps {
  /** Component property: icon (instance swap) — any Lucide component */
  icon?: React.ElementType;
  /**
   * Alternative to `icon`: render a plain emoji/unicode glyph inside the
   * icon circle instead of a Lucide component.
   * When provided, `icon` is ignored.
   */
  emojiIcon?: string;
  /** Component property: primary label */
  title?: string;
  /** Component property: supporting text (max 2 lines) */
  subtitle?: string;
  /**
   * Override the chip's fixed width. Defaults to "160px".
   * Pass a CSS value (e.g. "250px", "100%") for context-specific sizing.
   */
  chipWidth?: number | string;
  onClick?: () => void;
  className?: string;
}

export function QuickActionChip({
  icon:      IconComponent = Play,
  emojiIcon,
  title      = "Start Focus",
  subtitle   = "Begin a session",
  chipWidth  = "160px",
  onClick,
  className  = "",
}: QuickActionChipProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      className={`flex items-center text-left ${className}`}
      style={{
        // Frame
        width:         chipWidth,
        flexShrink:    0,
        gap:           "10px",
        padding:       "12px 14px",
        background:    "var(--surface-card)",
        border:        "1px solid var(--surface-border)",
        borderRadius:  "var(--radius-chip)",
        // Press feedback
        transform:     pressed ? "scale(0.96)" : "scale(1)",
        transition:    "transform 100ms ease-out, box-shadow 100ms ease-out",
        boxShadow:     pressed
          ? "none"
          : "0 1px 3px 0 rgba(26,18,16,0.06)",
        cursor:        "pointer",
      }}
      aria-label={`${title}: ${subtitle}`}
    >

      {/* ── Icon circle ──────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          width:           "32px",
          height:          "32px",
          flexShrink:      0,
          borderRadius:    "50%",
          background:      "var(--accent-tint)",
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
        }}
      >
        {emojiIcon ? (
          /* Emoji glyph — rendered at 15px so it fits the 32px circle */
          <span style={{
            fontSize:   "15px",
            lineHeight: 1,
            userSelect: "none",
          }}>{emojiIcon}</span>
        ) : (
          <IconComponent
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            style={{ color: "var(--accent-primary)" }}
          />
        )}
      </div>

      {/* ── Text column ──────────────────────────────────────────────────── */}
      <div
        style={{
          display:       "flex",
          flexDirection: "column",
          gap:           "2px",
          minWidth:      0,         // prevents flex overflow clipping text
          flex:          1,
        }}
      >
        {/* Title — 13px Semibold #1A1210 */}
        <span
          style={{
            fontFamily:   "var(--font-sf-pro)",
            fontSize:     "13px",
            fontWeight:   "var(--font-weight-semibold)",
            lineHeight:   "var(--text-lh-140)",
            color:        "var(--text-primary)",
            overflow:     "hidden",
            whiteSpace:   "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </span>

        {/* Subtitle — 12px Regular #6B5C54 · max 2 lines */}
        <span
          style={{
            fontFamily:          "var(--font-sf-pro)",
            fontSize:            "12px",
            fontWeight:          "var(--font-weight-regular)",
            lineHeight:          "var(--text-lh-140)",
            color:               "var(--text-secondary)",
            display:             "-webkit-box",
            WebkitLineClamp:     2,
            WebkitBoxOrient:     "vertical" as const,
            overflow:            "hidden",
          }}
        >
          {subtitle}
        </span>
      </div>

    </button>
  );
}