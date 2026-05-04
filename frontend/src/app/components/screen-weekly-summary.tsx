import React, { useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import {
  ArrowLeft, Share2, Clock, CheckCircle2,
  Target, Calendar, Trophy,
} from "lucide-react";
import { HighlightRow } from "./molecule-row-highlight";
import { PrimaryButton } from "./atom-button-primary";
import { StatusBadge }   from "./atom-badge-status";
import { BottomBar }     from "./molecule-nav-bottom-bar";
import type { BottomBarTab } from "./molecule-nav-bottom-bar";

// ─────────────────────────────────────────────────────────────────────────────
// Screen/Weekly-Summary — 390 × 844 px  ·  Background #FAF6F2
//
// Layer stack:
// ┌──────────────────────────────┐
// │  Status bar       54 px      │  transparent
// ├──────────────────────────────┤
// │  Nav header       56 px      │  ← back · "Weekly Summary" · share ⬆
// ├──────────────────────────────┤
// │  Scrollable area  flex-1     │  overflow-y auto · pb 80px
// │   ├─ Hero card      160 px   │  gradient · shine · sparkles · mascot
// │   ├─ Highlights             │  17px Semibold + white card (4 rows)
// │   ├─ This Week's Wins       │  header row + white card (trophy)
// │   └─ CTA button             │  Atom/Button/Primary fill-width
// ├──────────────────────────────┤
// │  Bottom nav       80 px      │  absolute · null (no active tab)
// └──────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 1.  Status bar
// ─────────────────────────────────────────────────────────────────────────────
function StatusBar() {
  return (
    <div
      aria-hidden="true"
      style={{
        height: "54px", flexShrink: 0,
        display: "flex", alignItems: "flex-end",
        justifyContent: "space-between",
        padding: "0 24px 10px",
        background: "transparent",
      }}
    >
      <span style={{
        fontFamily: "var(--font-sf-pro)", fontSize: "15px",
        fontWeight: "var(--font-weight-semibold)", lineHeight: 1,
        color: "var(--text-primary)", letterSpacing: "-0.01em",
      }}>9:41</span>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
          <rect x="0"    y="7" width="3" height="5"  rx="0.75" fill="var(--text-primary)" />
          <rect x="4.5"  y="5" width="3" height="7"  rx="0.75" fill="var(--text-primary)" />
          <rect x="9"    y="3" width="3" height="9"  rx="0.75" fill="var(--text-primary)" />
          <rect x="13.5" y="0" width="3" height="12" rx="0.75" fill="var(--text-primary)" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path d="M8 9.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" fill="var(--text-primary)" />
          <path d="M3.76 7.05a6 6 0 0 1 8.48 0" stroke="var(--text-primary)" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M1.17 4.46A9.5 9.5 0 0 1 14.83 4.46" stroke="var(--text-primary)" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="var(--text-primary)" strokeOpacity="0.35" />
          <rect x="22.5" y="3.5" width="2" height="5" rx="1.25" fill="var(--text-primary)" fillOpacity="0.4" />
          <rect x="2" y="2" width="17" height="8" rx="2.25" fill="var(--text-primary)" />
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.  Navigation header — ← back · "Weekly Summary" centred · share icon
// ─────────────────────────────────────────────────────────────────────────────
function NavHeader({ onBack, onShare }: {
  onBack?:  () => void;
  onShare?: () => void;
}) {
  return (
    <div
      className="glass-header glass-shine"
      style={{
      height: "56px", flexShrink: 0,
      display: "flex", alignItems: "center",
      justifyContent: "space-between",
      padding: "0 16px",
      position: "relative",
    }}>
      {/* ← Back */}
      <button
        type="button" onClick={onBack} aria-label="Go back"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          padding: 0, display: "flex", alignItems: "center",
          color: "var(--text-primary)",
        }}
      >
        <ArrowLeft size={24} strokeWidth={2} aria-hidden="true" />
      </button>

      {/* "Weekly Summary" — absolutely centred so it can't be pushed by variable-width side buttons */}
      <span style={{
        position: "absolute",
        left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        fontFamily:    "var(--font-sf-pro)",
        fontSize:      "17px",
        fontWeight:    "var(--font-weight-semibold)",
        lineHeight:    "var(--text-lh-140)",
        color:         "var(--text-primary)",
        letterSpacing: "-0.2px",
        whiteSpace:    "nowrap",
        pointerEvents: "none",
      }}>Weekly Summary</span>

      {/* Share ↑ */}
      <button
        type="button" onClick={onShare} aria-label="Share"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          padding: 0, display: "flex", alignItems: "center",
          color: "var(--text-primary)",
        }}
      >
        <Share2 size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.  Hero Card
//     160px · radius 16px · 3-layer: gradient → shine → content
//     Sparkle decorations: scattered ✦ in left column
//     AI mascot placeholder: 120 × 120 px
// ─────────────────────────────────────────────────────────────────────────────

// Scattered sparkle positions (left column area, relative to hero card content)
// Each: { top, left, size, opacity }
const SPARKLES = [
  { top:  "8%",  left:  "2%",  size: "10px", opacity: 0.90 },
  { top: "16%",  left: "44%",  size:  "7px", opacity: 0.55 },
  { top: "54%",  left:  "4%",  size:  "6px", opacity: 0.45 },
  { top: "72%",  left: "38%",  size:  "9px", opacity: 0.70 },
  { top: "38%",  left: "52%",  size:  "5px", opacity: 0.40 },
  { top: "88%",  left: "12%",  size:  "8px", opacity: 0.60 },
] as const;

function HeroCard() {
  return (
    <div style={{
      width: "100%", height: "160px",
      borderRadius: "16px",
      overflow: "hidden",
      position: "relative",
      boxShadow: "var(--shadow-hero-card)",
      flexShrink: 0,
    }}>
      {/* Layer 1 — Base gradient 135deg */}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(135deg, #D8694A 0%, #C05A3C 40%, #B8472A 100%)",
      }} />

      {/* Layer 2 — Shine overlay: top 45%, 270deg, white→transparent */}
      <div aria-hidden="true" style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: "45%",
        background:
          "linear-gradient(270deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.00) 100%)",
        pointerEvents: "none",
      }} />

      {/* Layer 3 — Content: horizontal, padding 20px, gap 12px */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex",
        alignItems: "center",
        padding: "20px",
        gap: "12px",
      }}>
        {/* ── Left: text column (flex-1) ──────────────────────────────────── */}
        <div style={{
          flex: 1, minWidth: 0,
          display: "flex", flexDirection: "column",
          gap: "6px",
          position: "relative",  // for sparkle absolute children
        }}>
          {/* Sparkle decorations — scattered ✦ */}
          {SPARKLES.map((s, i) => (
            <span
              key={i}
              aria-hidden="true"
              style={{
                position:  "absolute",
                top:       s.top,
                left:      s.left,
                fontSize:  s.size,
                lineHeight: 1,
                color:     "rgba(255,255,255,1)",
                opacity:   s.opacity,
                userSelect:"none",
                pointerEvents: "none",
                fontFamily: "system-ui",
              }}
            >✦</span>
          ))}

          {/* Main heading: "Amazing week, Alex! 🎉" — 22px Bold */}
          <span style={{
            fontFamily:    "var(--font-sf-pro)",
            fontSize:      "22px",
            fontWeight:    "var(--font-weight-bold)",
            lineHeight:    "var(--text-lh-140)",
            color:         "var(--text-on-accent)",   // #FFFFFF on coral bg
            letterSpacing: "-0.2px",
            position:      "relative",
          }}>Amazing week, {useAuthStore.getState().userName || 'there'}! 🎉</span>

          {/* Subtitle: 14px Regular rgba(255,255,255,0.85) */}
          <span style={{
            fontFamily: "var(--font-sf-pro)",
            fontSize:   "14px",
            fontWeight: "var(--font-weight-regular)",
            lineHeight: "var(--text-lh-140)",
            color:      "rgba(255,255,255,0.85)",
            maxWidth:   "180px",
            position:   "relative",
          }}>You showed up and made real progress.</span>
        </div>

        {/* ── Right: AI mascot placeholder ──────────────────────────────── */}
        <div
          aria-label="AI Mascot illustration placeholder"
          style={{
            width:          "120px",
            height:         "120px",
            flexShrink:     0,
            borderRadius:   "16px",
            background:     "rgba(255,255,255,0.10)",
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            gap:            "8px",
          }}
        >
          {/* Simple sparkle/star illustration placeholder */}
          <svg
            width="40" height="40" viewBox="0 0 40 40" fill="none"
            aria-hidden="true"
          >
            {/* Central star */}
            <path
              d="M20 4 L22.5 16 L34 20 L22.5 24 L20 36 L17.5 24 L6 20 L17.5 16 Z"
              fill="rgba(255,255,255,0.70)"
            />
            {/* Small accent dots */}
            <circle cx="6"  cy="8"  r="2" fill="rgba(255,255,255,0.50)" />
            <circle cx="34" cy="8"  r="2" fill="rgba(255,255,255,0.50)" />
            <circle cx="6"  cy="32" r="1.5" fill="rgba(255,255,255,0.35)" />
            <circle cx="34" cy="32" r="1.5" fill="rgba(255,255,255,0.35)" />
          </svg>
          {/* Label: 10px rgba(255,255,255,0.60) */}
          <span style={{
            fontFamily: "var(--font-sf-pro)",
            fontSize:   "10px",
            fontWeight: "var(--font-weight-regular)",
            lineHeight: 1,
            color:      "rgba(255,255,255,0.60)",
            textAlign:  "center",
          }}>AI Mascot</span>
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.  Highlights section
//     Section title + white card containing 4× Molecule/Row/Highlight
// ─────────────────────────────────────────────────────────────────────────────

// Row 3 right slot — "On track" plain text, green, NO arrow
const OnTrackSlot = (
  <StatusBadge type="success" />
);

// Row 4 right slot — sub-value text (muted caption)
const BestDaySlot = (
  <span style={{
    fontFamily:  "var(--font-sf-pro)",
    fontSize:    "12px",
    fontWeight:  "var(--font-weight-regular)",
    lineHeight:  "var(--text-lh-140)",
    color:       "var(--text-muted)",
    whiteSpace:  "nowrap",
    textAlign:   "right",
  }}>6h 12m focus time</span>
);

function HighlightsSection() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Section title — 17px Semibold #1A1210 */}
      <span style={{
        fontFamily:    "var(--font-sf-pro)",
        fontSize:      "17px",
        fontWeight:    "var(--font-weight-semibold)",
        lineHeight:    "var(--text-lh-140)",
        color:         "var(--text-primary)",
        letterSpacing: "-0.2px",
      }}>Highlights</span>

      {/* White card — padding 0 16px · houses all 4 rows */}
      <div style={{
        background:   "var(--surface-card)",
        border:       "1px solid var(--surface-border)",
        borderRadius: "var(--radius-card)",
        boxShadow:    "var(--shadow-card)",
        padding:      "0 16px",
      }}>
        {/* 1. Focus Time — Clock / 18h 42m / +12% up */}
        <HighlightRow
          icon={Clock}
          label="Focus Time"
          value="18h 42m"
          deltaDirection="up"
          deltaText="+12%"
        />

        {/* 2. Tasks Completed — CheckCircle2 / 36 / +8 from last week up */}
        <HighlightRow
          icon={CheckCircle2}
          label="Tasks Completed"
          value="36"
          deltaDirection="up"
          deltaText="+8 from last week"
        />

        {/* 3. Goals Progress — Target / 3 active / "On track" green, no arrow */}
        <HighlightRow
          icon={Target}
          label="Goals Progress"
          value="3 active"
          rightSlot={OnTrackSlot}
        />

        {/* 4. Best Day — Calendar / Thursday / "6h 12m focus time" sub-text */}
        <HighlightRow
          icon={Calendar}
          label="Best Day"
          value="Thursday"
          rightSlot={BestDaySlot}
          hideBorder
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5.  This Week's Wins section
//     Header row (title + chevron) + white card with trophy row
// ─────────────────────────────────────────────────────────────────────────────
function WinsSection() {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Header row — horizontal, space-between */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          background: "transparent", border: "none",
          cursor: "pointer", padding: 0, width: "100%",
        }}
        aria-expanded={open}
      >
        {/* "This Week's Wins" — 17px Semibold #1A1210 */}
        <span style={{
          fontFamily:    "var(--font-sf-pro)",
          fontSize:      "17px",
          fontWeight:    "var(--font-weight-semibold)",
          lineHeight:    "var(--text-lh-140)",
          color:         "var(--text-primary)",
          letterSpacing: "-0.2px",
        }}>This Week's Wins</span>

        {/* Chevron — 17px / #9C8880 */}
        <span style={{
          fontFamily: "var(--font-sf-pro)",
          fontSize:   "17px",
          lineHeight: "var(--text-lh-140)",
          color:      "var(--text-muted)",
          display:    "inline-block",
          transition: "transform 200ms ease",
          transform:  open ? "rotate(180deg)" : "rotate(0deg)",
        }} aria-hidden="true">∨</span>
      </button>

      {/* Win card (collapsible) */}
      {open && (
        <div style={{
          background:   "var(--surface-card)",
          border:       "1px solid var(--surface-border)",
          borderRadius: "var(--radius-card)",
          boxShadow:    "var(--shadow-card)",
          padding:      "16px",
          display:      "flex",
          alignItems:   "center",
          gap:          "12px",
        }}>
          {/* 🏆 Trophy icon — 40px container / #D4920A */}
          <div style={{
            width: "40px", height: "40px", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Trophy
              size={36}
              strokeWidth={1.5}
              aria-hidden="true"
              style={{ color: "var(--status-energy)" }}   // #D4920A
            />
          </div>

          {/* Text column */}
          <div style={{
            flex: 1, minWidth: 0,
            display: "flex", flexDirection: "column", gap: "3px",
          }}>
            {/* "7 Day Streak!" — 16px Bold #1A1210 */}
            <span style={{
              fontFamily: "var(--font-sf-pro)",
              fontSize:   "16px",
              fontWeight: "var(--font-weight-bold)",
              lineHeight: "var(--text-lh-140)",
              color:      "var(--text-primary)",
              letterSpacing: "-0.1px",
            }}>7 Day Streak!</span>

            {/* Sub-text — 13px Regular #6B5C54 */}
            <span style={{
              fontFamily: "var(--font-sf-pro)",
              fontSize:   "13px",
              fontWeight: "var(--font-weight-regular)",
              lineHeight: "var(--text-lh-140)",
              color:      "var(--text-secondary)",
            }}>You're building something incredible.</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6.  Screen/Weekly-Summary shell
// ─────────────────────────────────────────────────────────────────────────────
export interface ScreenWeeklySummaryProps {
  onBack?:      () => void;
  onShare?:     () => void;
  onViewReport?: () => void;
  onTabChange?: (tab: BottomBarTab) => void;
}

export function ScreenWeeklySummary({
  onBack,
  onShare,
  onViewReport,
  onTabChange,
}: ScreenWeeklySummaryProps) {
  return (
    <div style={{
      width:         "390px",
      height:        "844px",
      flexShrink:    0,
      background:    "var(--bg-base)",
      overflow:      "hidden",
      position:      "relative",
      display:       "flex",
      flexDirection: "column",
    }}>
      {/* ── 1. Status bar ───────────────────────────────────────────────── */}
      <StatusBar />

      {/* ── 2. Navigation header ────────────────────────────────────────── */}
      <NavHeader onBack={onBack} onShare={onShare} />

      {/* ── 3. Scrollable content ───────────────────────────────────────── */}
      <div style={{
        flex:          1,
        overflowY:     "auto",
        overflowX:     "hidden",
        padding:       "0 16px",
        paddingBottom: "80px",
        WebkitOverflowScrolling:
          "touch" as React.CSSProperties["WebkitOverflowScrolling"],
      }}>
        <div style={{
          display:       "flex",
          flexDirection: "column",
          gap:           "12px",    // --space-md  (was 16px)
          paddingTop:    "4px",
        }}>

          {/* ── Hero card ─────────────────────────────────────────────── */}
          <HeroCard />

          {/* ── Highlights ────────────────────────────────────────────── */}
          <HighlightsSection />

          {/* ── This Week's Wins ──────────────────────────────────────── */}
          <WinsSection />

          {/* ── CTA — Atom/Button/Primary fill-width ──────────────────── */}
          <PrimaryButton
            label="View Detailed Report"
            onClick={onViewReport}
          />

        </div>
      </div>

      {/* ── 4. Bottom nav — absolute · null = no active tab ─────────────── */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20 }}>
        <BottomBar
          activeTab={null}
          onTabChange={onTabChange}
        />
      </div>
    </div>
  );
}