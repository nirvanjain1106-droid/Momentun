
import { QuickActionChip } from "./molecule-chip-quick-action";

// ─────────────────────────────────────────────────────────────────────────────
// Organism/Banner/AI-Coach
// Figma spec:
//   Frame: 1440 × 120 px · bg #FFFFFF · top-border 1px #EDE5DE
//   Auto layout: horizontal · center-vertical · padding 16px 40px · gap 32px
//
//   LEFT SECTION (horizontal, gap 12px, center-vertical, width 280px):
//     Mascot    64px circle · #F5E8E4 bg · star SVG placeholder
//     Text col  "AI Coach" 16px Bold #1A1210
//               description 13px Regular #6B5C54
//
//   RIGHT SECTION (horizontal, gap 16px, flex-1):
//     4× Molecule/Chip/Quick-Action (each 250px)
//       Chip 1  📅 "Optimize my schedule" / "I'll adjust…"
//       Chip 2  🛡 "Protect my focus"     / "Block distractions…"
//       Chip 3  📋 "Plan my week"          / "Create a balanced…"
//       Chip 4  🔥 "7 Day Streak"          / "You're on fire!…"
//
// Geometry check:
//   inner width = 1440 − 2×40 = 1360px
//   right section = 1360 − 280 (left) − 32 (gap) = 1048px
//   4 chips × 250px + 3 gaps × 16px = 1000 + 48 = 1048px ✓
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Mascot placeholder — 64px circle
// ─────────────────────────────────────────────────────────────────────────────
function MascotCircle() {
  return (
    <div
      aria-label="AI Mascot illustration placeholder"
      style={{
        width:          "64px",
        height:         "64px",
        flexShrink:     0,
        borderRadius:   "50%",
        background:     "#F5E8E4",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            "4px",
      }}
    >
      {/* Warm coral 4-point star — matches app mascot visual language */}
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path
          d="M14 3 L16.1 11 L24 14 L16.1 17 L14 25 L11.9 17 L4 14 L11.9 11 Z"
          fill="#D8694A"
          opacity="0.85"
        />
        {/* Energy-gold mini sparkle — top-right */}
        <path
          d="M22 4 L22.8 6.4 L25 7 L22.8 7.6 L22 10 L21.2 7.6 L19 7 L21.2 6.4 Z"
          fill="#D4920A"
          opacity="0.75"
        />
        {/* Accent dots */}
        <circle cx="5"  cy="6"  r="1.4" fill="#B8472A" opacity="0.35" />
        <circle cx="23" cy="22" r="1.2" fill="#B8472A" opacity="0.30" />
      </svg>

      {/* "Mascot" label — 8px muted, centered below icon */}
      <span style={{
        fontFamily:  "var(--font-sf-pro)",
        fontSize:    "8px",
        fontWeight:  "var(--font-weight-regular)",
        lineHeight:  1,
        color:       "var(--text-muted)",
        letterSpacing: "0.02em",
        userSelect:  "none",
      }}>Mascot</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chip data
// ─────────────────────────────────────────────────────────────────────────────
const CHIPS = [
  {
    id:       "schedule",
    emoji:    "📅",
    title:    "Optimize my schedule",
    subtitle: "I'll adjust your day for more focus time.",
  },
  {
    id:       "focus",
    emoji:    "🛡",
    title:    "Protect my focus",
    subtitle: "Block distractions and deep work time.",
  },
  {
    id:       "week",
    emoji:    "📋",
    title:    "Plan my week",
    subtitle: "Create a balanced plan for your goals.",
  },
  {
    id:       "streak",
    emoji:    "🔥",
    title:    "7 Day Streak",
    subtitle: "You're on fire! Keep it going!",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Organism/Banner/AI-Coach
// ─────────────────────────────────────────────────────────────────────────────
export interface BannerAICoachProps {
  onChipClick?: (chipId: string) => void;
  className?:   string;
}

export function BannerAICoach({
  onChipClick,
  className = "",
}: BannerAICoachProps) {
  return (
    <div
      className={className}
      role="region"
      aria-label="AI Coach banner"
      style={{
        /* Frame */
        width:          "1440px",
        height:         "120px",
        flexShrink:     0,
        background:     "#FFFFFF",
        borderTop:      "1px solid #EDE5DE",

        /* Auto layout */
        display:        "flex",
        flexDirection:  "row",
        alignItems:     "center",
        padding:        "16px 40px",
        gap:            "32px",
        boxSizing:      "border-box",
      }}
    >

      {/* ── LEFT SECTION — Mascot + text column ──────────────────────────── */}
      <div style={{
        width:      "280px",
        flexShrink: 0,
        display:    "flex",
        flexDirection: "row",
        alignItems: "center",
        gap:        "12px",
      }}>
        {/* Mascot 64px circle */}
        <MascotCircle />

        {/* Text column */}
        <div style={{
          display:       "flex",
          flexDirection: "column",
          gap:           "3px",
          minWidth:      0,
          flex:          1,
        }}>
          {/* "AI Coach" — 16px Bold #1A1210 */}
          <span style={{
            fontFamily:    "var(--font-sf-pro)",
            fontSize:      "16px",
            fontWeight:    "var(--font-weight-bold)",
            lineHeight:    "var(--text-lh-140)",
            color:         "var(--text-primary)",
            letterSpacing: "-0.1px",
            whiteSpace:    "nowrap",
          }}>AI Coach</span>

          {/* Description — 13px Regular #6B5C54 */}
          <span style={{
            fontFamily:  "var(--font-sf-pro)",
            fontSize:    "13px",
            fontWeight:  "var(--font-weight-regular)",
            lineHeight:  "var(--text-lh-140)",
            color:       "var(--text-secondary)",
            // allow 2-line wrap within the fixed left column
            display:     "-webkit-box",
            WebkitLineClamp:    2,
            WebkitBoxOrient:    "vertical" as const,
            overflow:    "hidden",
          }}>
            I'm here to help you plan smarter, stay focused, and reach your goals.
          </span>
        </div>
      </div>

      {/* ── RIGHT SECTION — 4× Quick-Action chips ────────────────────────── */}
      {/*   flex: 1 → fills 1360 − 280 − 32 = 1048px                        */}
      {/*   gap: 16px, 4 chips × 250px + 3×16px = 1048px ✓                  */}
      <div style={{
        flex:       1,
        display:    "flex",
        flexDirection: "row",
        alignItems: "center",
        gap:        "16px",
      }}>
        {CHIPS.map(({ id, emoji, title, subtitle }) => (
          <QuickActionChip
            key={id}
            emojiIcon={emoji}
            title={title}
            subtitle={subtitle}
            chipWidth="250px"
            onClick={() => onChipClick?.(id)}
          />
        ))}
      </div>

    </div>
  );
}
