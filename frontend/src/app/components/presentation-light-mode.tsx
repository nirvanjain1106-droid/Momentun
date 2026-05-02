import React, { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { ScreenHome }          from "./screen-home";
import { ScreenTasks }         from "./screen-tasks";
import { ScreenInsights }      from "./screen-insights";
import { ScreenGoals }         from "./screen-goals";
import { ScreenWeeklySummary } from "./screen-weekly-summary";
import { BannerAICoach }       from "./organism-banner-ai-coach";

// ─────────────────────────────────────────────────────────────────────────────
// Presentation/Light-Mode
// Figma spec:
//   Frame:   1440 × 1024 px  ·  Background #FAF6F2
//
// Geometry:
//   Phone inner width  = 220 − 16 (8px border each side) = 204px
//   Screen scale       = 204 / 390 ≈ 0.52308
//   Scaled screen h    = 844 × 0.52308 ≈ 441px
//   Phone outer height = 441 + 16 (borders) = 457px
//   Phone row total    = 5 × 220 + 4 × 60 gap = 1340px  (50px breathing each side)
//   Banner             = position absolute · bottom 0 · height 120px
//   Content centering  = flex-1 · justifyContent center · paddingBottom 120px
// ─────────────────────────────────────────────────────────────────────────────

const PHONE_OUTER_W  = 220;
const BORDER_PX      = 8;
const PHONE_INNER_W  = PHONE_OUTER_W - BORDER_PX * 2;         // 204
const SCREEN_W       = 390;
const SCREEN_H       = 844;
const SCALE          = PHONE_INNER_W / SCREEN_W;               // ≈ 0.52308
const PHONE_INNER_H  = Math.round(SCREEN_H * SCALE);           // 441
const PHONE_OUTER_H  = PHONE_INNER_H + BORDER_PX * 2;          // 457

// ─────────────────────────────────────────────────────────────────────────────
// "M" Logo badge — 48px rounded square · coral gradient · white M
// ───────���─────────────────────────────────────────────────────────────────────
function MomentumLogo() {
  return (
    <div
      aria-hidden="true"
      style={{
        width:          "48px",
        height:         "48px",
        borderRadius:   "14px",
        position:       "relative",
        overflow:       "hidden",
        flexShrink:     0,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
      }}
    >
      {/* Base gradient */}
      <span style={{
        position: "absolute", inset: 0,
        background: "var(--accent-primary)",
      }} />
      {/* Shine overlay removed */}
      {/* M glyph */}
      <span style={{
        position:      "relative",
        fontFamily:    "var(--font-sf-pro)",
        fontSize:      "22px",
        fontWeight:    "var(--font-weight-bold)",
        color:         "#FFFFFF",
        letterSpacing: "-0.5px",
        lineHeight:    1,
      }}>M</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dark / Light mode toggle pill
// 80 × 32px · border 1px #EDE5DE · bg #FFFFFF
// Moon left (#6B5C54) · Sun right (#B8472A, active)
// ─────────────────────────────────────────────────────────────────────────────
function ThemeToggle({
  isDark,
  onToggle,
}: { isDark: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width:          "80px",
        height:         "32px",
        border:         "1px solid #EDE5DE",
        borderRadius:   "100px",
        background:     isDark ? "#1A1210" : "#FFFFFF",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "0 10px",
        cursor:         "pointer",
        transition:     "background 200ms ease",
        flexShrink:     0,
      }}
    >
      {/* Moon — left, active in dark mode */}
      <Moon
        size={16}
        aria-hidden="true"
        style={{
          color:      isDark ? "#B8472A" : "#6B5C54",
          transition: "color 200ms ease",
          flexShrink: 0,
        }}
      />

      {/* Sliding pill indicator */}
      <span style={{
        width:        "22px",
        height:       "22px",
        borderRadius: "50%",
        background: "var(--accent-primary)",
        position:     "absolute",
        // slide: left side when dark (moon), right side when light (sun)
        left:         isDark ? "5px" : "calc(80px - 27px)",
        transition:   "left 200ms cubic-bezier(0.34,1.56,0.64,1)",
        pointerEvents: "none",
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
      }}>
        {isDark
          ? <Moon  size={11} color="#FFFFFF" aria-hidden="true" />
          : <Sun   size={11} color="#FFFFFF" aria-hidden="true" />
        }
      </span>

      {/* Sun — right, active in light mode */}
      <Sun
        size={16}
        aria-hidden="true"
        style={{
          color:      isDark ? "#6B5C54" : "#B8472A",
          transition: "color 200ms ease",
          flexShrink: 0,
        }}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// iPhone frame wrapper — 220px wide · 8px solid #1A1210 bezel · r-36 · shadow
// ─────────────────────────────────────────────────────────────────────────────
function PhoneFrame({
  label,
  children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", flexShrink: 0 }}>
      {/* Phone chrome */}
      <div
        aria-label={`${label} screen in iPhone frame`}
        style={{
          width:        `${PHONE_OUTER_W}px`,
          height:       `${PHONE_OUTER_H}px`,
          borderRadius: "36px",
          border:       `${BORDER_PX}px solid #1A1210`,
          boxShadow:    "0 24px 48px rgba(0,0,0,0.15)",
          overflow:     "hidden",
          flexShrink:   0,
          position:     "relative",
          background:   "#1A1210",
        }}
      >
        {/* Dynamic Island pill — subtle realism */}
        <div style={{
          position:     "absolute",
          top:          "10px",
          left:         "50%",
          transform:    "translateX(-50%)",
          width:        "64px",
          height:       "12px",
          borderRadius: "100px",
          background:   "#1A1210",
          zIndex:       10,
          pointerEvents: "none",
        }} />

        {/* Scaled screen content */}
        <div style={{
          width:    `${PHONE_INNER_W}px`,
          height:   `${PHONE_INNER_H}px`,
          overflow: "hidden",
        }}>
          <div style={{
            transformOrigin: "top left",
            transform:       `scale(${SCALE})`,
            width:           `${SCREEN_W}px`,
            height:          `${SCREEN_H}px`,
          }}>
            {children}
          </div>
        </div>
      </div>

      {/* Screen label below the phone */}
      <span style={{
        fontFamily:    "var(--font-sf-pro)",
        fontSize:      "11px",
        fontWeight:    "var(--font-weight-semibold)",
        color:         "var(--text-muted)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        userSelect:    "none",
      }}>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentation/Light-Mode — main export
// ─────────────────────────────────────────────────────────────────────────────
export interface PresentationLightModeProps {
  className?: string;
}

export function PresentationLightMode({ className = "" }: PresentationLightModeProps) {
  const [isDark, setIsDark] = useState(false);

  return (
    <div
      className={className}
      style={{
        width:    "1440px",
        height:   "1024px",
        flexShrink: 0,
        background: "#FAF6F2",
        position:  "relative",
        overflow:  "hidden",
        display:   "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Dark / Light toggle — absolute top-right ─────────────────────── */}
      <div style={{ position: "absolute", top: "28px", right: "40px", zIndex: 30 }}>
        <ThemeToggle isDark={isDark} onToggle={() => setIsDark(v => !v)} />
      </div>

      {/* ── Main content — fills space above banner, vertically centred ───── */}
      <div style={{
        flex:           1,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        paddingBottom:  "120px",   // reserves space for the absolute banner
        gap:            "40px",
      }}>

        {/* ── TOP SECTION ── Logo · Title · Tagline ──────────────────────── */}
        <div style={{
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          gap:            "8px",
        }}>
          {/* "M" logo badge */}
          <MomentumLogo />

          {/* "Momentum" — 40px Bold #1A1210 */}
          <span style={{
            fontFamily:    "var(--font-sf-pro)",
            fontSize:      "40px",
            fontWeight:    "var(--font-weight-bold)",
            lineHeight:    "var(--text-lh-140)",
            color:         "#1A1210",
            letterSpacing: "-0.5px",
            marginTop:     "4px",
          }}>Momentum</span>

          {/* Tagline — 18px Regular #9C8880 */}
          <span style={{
            fontFamily:  "var(--font-sf-pro)",
            fontSize:    "18px",
            fontWeight:  "var(--font-weight-regular)",
            lineHeight:  "var(--text-lh-140)",
            color:       "#9C8880",
            letterSpacing: "0.01em",
          }}>AI-Powered Adaptive Scheduling</span>
        </div>

        {/* ── PHONE FRAMES ROW ── 5 iPhones evenly spaced ─────────────────── */}
        {/*   5 × 220 + 4 × 60 gap = 1340px · centred in 1440px             */}
        <div style={{
          display:        "flex",
          flexDirection:  "row",
          alignItems:     "flex-start",
          justifyContent: "center",
          gap:            "60px",
        }}>
          <PhoneFrame label="Home">
            <ScreenHome />
          </PhoneFrame>

          <PhoneFrame label="Tasks">
            <ScreenTasks />
          </PhoneFrame>

          <PhoneFrame label="Insights">
            <ScreenInsights />
          </PhoneFrame>

          <PhoneFrame label="Goals">
            <ScreenGoals />
          </PhoneFrame>

          <PhoneFrame label="Weekly Summary">
            <ScreenWeeklySummary />
          </PhoneFrame>
        </div>

      </div>

      {/* ── BANNER — pinned to bottom ─────────────────────────────────────── */}
      <div style={{
        position: "absolute",
        bottom:   0,
        left:     0,
        right:    0,
        zIndex:   20,
      }}>
        <BannerAICoach />
      </div>
    </div>
  );
}
