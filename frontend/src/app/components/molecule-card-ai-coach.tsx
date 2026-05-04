import { Star, Sparkles } from "lucide-react";
import { PrimaryButton } from "./atom-button-primary";

// ─────────────────────────────────────────────────────────────────────────────
// Molecule/Card/AI-Coach
// Figma spec:
//   Frame: fill · radius 16px · bg #FFFFFF · border 1px #EDE5DE
//          left-edge accent 2px #B8472A · padding 16px
//          horizontal auto-layout · gap 12px · align top · Shadow/Card
//
//   LEFT  — Mascot placeholder (72×72 · radius 8px · #F5E8E4)
//             Sparkles icon + "Mascot" label (10px / #9C8880)
//
//   RIGHT — Vertical column, gap 8px, fill
//     Row 1   "AI Coach" (15px Bold #1A1210) ·· Star (16px #D4920A)
//     Body    [headline]  14px Semibold #1A1210      ← component property
//             [bodyText]  13px Regular  #6B5C54      ← component property
//     CTA     Atom/Button/Primary · label            ← component property
//
// ──────────────────────────────────────────────────────────────────────���──────

export interface AICoachCardProps {
  /** Component property: bold short message / catchphrase */
  headline?: string;
  /** Component property: descriptive paragraph body text */
  bodyText?: string;
  /** Component property: CTA button label */
  ctaLabel?: string;
  onCTAClick?: () => void;
  className?: string;
}

export function AICoachCard({
  headline    = "You're on a roll! 🔥",
  bodyText    = "Your focus is highest in the morning. Let's protect that time.",
  ctaLabel    = "Chat with Coach →",
  onCTAClick,
  className   = "",
}: AICoachCardProps) {
  return (
    <div
      className={`w-full glass-surface glass-shine ${className}`}
      style={{
        // Frame
        position:      "relative",                     // Required for glass-shine
        borderRadius:  "var(--radius-card)",           // 16px
        background:    "var(--surface-card)",           // #FFFFFF
        border:        "1px solid var(--surface-border)", // #EDE5DE
        // Left-edge accent (2px) stacked with Shadow/Card — no layout side-effects
        boxShadow:     "inset 2px 0 0 0 var(--accent-primary), var(--shadow-card)",
        padding:       "16px",
        // Horizontal auto-layout
        display:       "flex",
        flexDirection: "row",
        gap:           "12px",
        alignItems:    "flex-start",
      }}
    >

      {/* ── Left: Mascot placeholder (72 × 72) ──────────────────────────── */}
      <div
        aria-label="AI Coach mascot placeholder"
        style={{
          width:           "72px",
          height:          "72px",
          flexShrink:      0,
          borderRadius:    "8px",
          background:      "var(--accent-tint)",        // #F5E8E4
          display:         "flex",
          flexDirection:   "column",
          alignItems:      "center",
          justifyContent:  "center",
          gap:             "5px",
        }}
      >
        {/* Sparkles icon — placeholder visual until real mascot is supplied */}
        <Sparkles
          size={26}
          strokeWidth={1.5}
          aria-hidden="true"
          style={{ color: "var(--accent-primary)" }}
        />
        <span
          style={{
            fontFamily: "var(--font-sf-pro)",
            fontSize:   "10px",
            fontWeight: "var(--font-weight-regular)",
            lineHeight: 1,
            color:      "var(--text-muted)",             // #9C8880
            letterSpacing: "0.02em",
          }}
        >
          Mascot
        </span>
      </div>

      {/* ── Right: Info column ───────────────────────────────────────────── */}
      <div
        style={{
          display:       "flex",
          flexDirection: "column",
          gap:           "8px",
          flex:          1,
          minWidth:      0,                              // prevents flex overflow
        }}
      >

        {/* Row 1 — "AI Coach" title + star ─────────────────────────────── */}
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-sf-pro)",
              fontSize:   "var(--text-body-size)",      // 15px
              fontWeight: "var(--font-weight-bold)",     // 700
              lineHeight: "var(--text-lh-140)",
              color:      "var(--text-primary)",         // #1A1210
            }}
          >
            AI Coach
          </span>

          {/* Star — outlined ☆ style, amber */}
          <Star
            size={16}
            strokeWidth={1.75}
            fill="none"
            aria-hidden="true"
            style={{ color: "var(--status-energy)", flexShrink: 0 }} // #D4920A
          />
        </div>

        {/* Body text block ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>

          {/* Headline — 14px Semibold (component property) */}
          <span
            style={{
              fontFamily: "var(--font-sf-pro)",
              fontSize:   "14px",
              fontWeight: "var(--font-weight-semibold)", // 600
              lineHeight: "var(--text-lh-140)",
              color:      "var(--text-primary)",         // #1A1210
            }}
          >
            {headline}
          </span>

          {/* Paragraph — 13px Regular (component property) */}
          <span
            style={{
              fontFamily: "var(--font-sf-pro)",
              fontSize:   "13px",
              fontWeight: "var(--font-weight-regular)",  // 400
              lineHeight: "var(--text-lh-140)",
              color:      "var(--text-secondary)",       // #6B5C54
            }}
          >
            {bodyText}
          </span>
        </div>

        {/* CTA — Atom/Button/Primary, fills right column (w-full built in) */}
        <PrimaryButton
          label={ctaLabel}
          onClick={onCTAClick}
        />
      </div>
    </div>
  );
}
