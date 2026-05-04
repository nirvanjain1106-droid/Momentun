import { useState } from "react";
import { Target, BarChart2, Sparkles } from "lucide-react";
import { PrimaryButton } from "./atom-button-primary";
import { SecondaryButton } from "./atom-button-secondary";
import { BottomBar }     from "./molecule-nav-bottom-bar";
import type { BottomBarTab } from "./molecule-nav-bottom-bar";

// ─────────────────────────────────────────────────────────────────────────────
// Screen/Empty-Goals — 390 × 844 px  ·  Background #FAF6F2
//
// Layer stack:
// ┌──────────────────────────────┐
// │  Status bar       54 px      │  transparent
// ├──────────────────────────────┤
// │  Goals header     56 px      │  "Goals" Bold · "+ New Goal" compact btn
// ├──────────────────────────────┤
// │  Center content   flex-1     │  vertically + horizontally centred
// │   ├─ Mascot circle 160×160   │  #F5E8E4 · "AI Mascot" label
// │   ├─ "No goals yet" heading  │  22px Bold #1A1210
// │   ├─ Subtext                 │  15px Regular #6B5C54 · max 260px
// │   ├─ Feature list × 3        │  icon 20px · text 14px · gap 10px
// │   ├─ CTA button  280px       │  "+ Create Your First Goal"
// │   └─ "Explore Examples" link │  14px Semibold #B8472A underline
// ├──────────────────────────────┤
// │  Bottom nav       80 px      │  absolute · Goals active
// └──────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 1.  Status bar (shared pattern)
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
        {/* Signal bars */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
          <rect x="0"    y="7" width="3" height="5"  rx="0.75" fill="var(--text-primary)" />
          <rect x="4.5"  y="5" width="3" height="7"  rx="0.75" fill="var(--text-primary)" />
          <rect x="9"    y="3" width="3" height="9"  rx="0.75" fill="var(--text-primary)" />
          <rect x="13.5" y="0" width="3" height="12" rx="0.75" fill="var(--text-primary)" />
        </svg>
        {/* Wi-Fi */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path d="M8 9.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" fill="var(--text-primary)" />
          <path d="M3.76 7.05a6 6 0 0 1 8.48 0" stroke="var(--text-primary)" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M1.17 4.46A9.5 9.5 0 0 1 14.83 4.46" stroke="var(--text-primary)" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {/* Battery */}
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
// 3.  Goals header — "Goals" + compact CTA (same as Screen/Goals)
// ─────────────────────────────────────────────────────────────────────────────
function GoalsHeader({ onNewGoal }: { onNewGoal?: () => void }) {
  return (
    <div style={{
      height:         "56px",
      flexShrink:     0,
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      padding:        "0 16px",
    }}>
      <span style={{
        fontFamily:    "var(--font-sf-pro)",
        fontSize:      "22px",
        fontWeight:    "var(--font-weight-bold)",
        lineHeight:    "var(--text-lh-140)",
        color:         "var(--text-primary)",
        letterSpacing: "-0.2px",
      }}>Goals</span>

      <PrimaryButton 
        label="+ New Goal" 
        onClick={onNewGoal} 
        style={{ "--btn-height": "36px", "--btn-padding": "0 16px" } as any}
        className="!w-auto"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.  Mascot placeholder — 160px circle · #F5E8E4 · "AI Mascot" label
// ─────────────────────────────────────────────────────────────────────────────
function MascotCircle() {
  return (
    <div style={{
      width:          "160px",
      height:         "160px",
      borderRadius:   "50%",
      background:     "var(--accent-tint)",   // #F5E8E4
      flexShrink:     0,
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      gap:            "10px",
    }}>
      {/* Decorative star illustration in warm coral */}
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
        {/* Central 4-point star */}
        <path
          d="M28 6 L31.4 22 L48 28 L31.4 34 L28 50 L24.6 34 L8 28 L24.6 22 Z"
          fill="#D8694A"
          opacity="0.85"
        />
        {/* Small accent sparkles — use style prop for CSS var resolution */}
        <circle cx="10" cy="12" r="2.5" style={{ fill: "var(--accent-primary)" }} opacity="0.40" />
        <circle cx="46" cy="12" r="2.5" style={{ fill: "var(--accent-primary)" }} opacity="0.40" />
        <circle cx="10" cy="44" r="1.8" style={{ fill: "var(--accent-primary)" }} opacity="0.30" />
        <circle cx="46" cy="44" r="1.8" style={{ fill: "var(--accent-primary)" }} opacity="0.30" />
        {/* Tiny top-right sparkle */}
        <path
          d="M44 6 L45.2 9 L48 10 L45.2 11 L44 14 L42.8 11 L40 10 L42.8 9 Z"
          style={{ fill: "var(--status-energy)" }}   // #D4920A
          opacity="0.70"
        />
      </svg>

      {/* Label: 12px Regular #9C8880 */}
      <span style={{
        fontFamily:  "var(--font-sf-pro)",
        fontSize:    "12px",
        fontWeight:  "var(--font-weight-regular)",
        lineHeight:  1,
        color:       "var(--text-muted)",
        letterSpacing: "0.01em",
      }}>AI Mascot</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5.  Feature list — 3 rows · icon 20px #B8472A · text 14px #6B5C54
// ─────────────────────────────────────────────────────────────────────────────
const FEATURES = [
  { Icon: Target,   text: "Stay focused on what matters" },
  { Icon: BarChart2, text: "Track progress visually"      },
  { Icon: Sparkles, text: "Get AI-powered insights"       },
] as const;

function FeatureList() {
  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:           "12px",    // --space-md  (was 16px)
      alignSelf:     "stretch",
      paddingLeft:   "40px",
    }}>
      {FEATURES.map(({ Icon, text }) => (
        <div
          key={text}
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        "10px",
          }}
        >
          {/* Icon: 20px · #B8472A */}
          <Icon
            size={20}
            strokeWidth={1.75}
            aria-hidden="true"
            style={{ color: "var(--accent-primary)", flexShrink: 0 }}
          />
          {/* Text: 14px Regular #6B5C54 */}
          <span style={{
            fontFamily:  "var(--font-sf-pro)",
            fontSize:    "14px",
            fontWeight:  "var(--font-weight-regular)",
            lineHeight:  "var(--text-lh-140)",
            color:       "var(--text-secondary)",
          }}>{text}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6.  Screen/Empty-Goals shell
// ─────────────────────────────────────────────────────────────────────────────
export interface ScreenEmptyGoalsProps {
  activeTab?:      BottomBarTab;
  onTabChange?:    (tab: BottomBarTab) => void;
  onNewGoal?:      () => void;
  onCreateGoal?:   () => void;
  onExploreExamples?: () => void;
}

export function ScreenEmptyGoals({
  activeTab   = "Goals",
  onTabChange,
  onNewGoal,
  onCreateGoal,
  onExploreExamples,
}: ScreenEmptyGoalsProps) {
  const [_navTab, setNavTab] = useState<BottomBarTab>(activeTab);

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
      {/* ── 1. Status bar ─────────────────────────────────────────────────── */}
      <StatusBar />

      {/* ── 2. Goals header ───────────────────────────────────────────────── */}
      <GoalsHeader onNewGoal={onNewGoal ?? onCreateGoal} />

      {/* ── 3. Center content — flex-1, full vertical centering ────────────── */}
      <div style={{
        flex:           1,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "0 16px 80px",   // 80px bottom clears the absolute nav
        overflow:       "hidden",
      }}>
        {/* Content stack: vertical, center-aligned, gap 16px */}
        <div style={{
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          gap:            "16px",
          width:          "100%",
          maxWidth:       "340px",
        }}>

          {/* ── Mascot placeholder — 160×160 circle ──────────────────────── */}
          <MascotCircle />

          {/* ── "No goals yet" — 22px Bold #1A1210 ───────────────────────── */}
          <span style={{
            fontFamily:    "var(--font-sf-pro)",
            fontSize:      "22px",
            fontWeight:    "var(--font-weight-bold)",
            lineHeight:    "var(--text-lh-140)",
            color:         "var(--text-primary)",
            textAlign:     "center",
            letterSpacing: "-0.2px",
          }}>No goals yet</span>

          {/* ── Subtext — 15px Regular #6B5C54 · max-width 260px ─────────── */}
          <span style={{
            fontFamily:  "var(--font-sf-pro)",
            fontSize:    "15px",
            fontWeight:  "var(--font-weight-regular)",
            lineHeight:  "var(--text-lh-140)",
            color:       "var(--text-secondary)",
            textAlign:   "center",
            maxWidth:    "260px",
          }}>
            Let's set your first goal and start building momentum!
          </span>

          {/* ── Feature list — icon + text rows ──────────────────────────── */}
          <FeatureList />

          {/* ── CTA — PrimaryButton 280px wide ───────────────────────────── */}
          <div style={{ width: "280px" }}>
            <PrimaryButton
              label="+ Create Your First Goal"
              onClick={onCreateGoal}
            />
          </div>

          {/* ── Secondary link — "Explore Examples" ──────────────────────── */}
          <SecondaryButton
            label="Explore Examples"
            onClick={onExploreExamples}
          />

        </div>
      </div>

      {/* ── 4. Bottom nav — absolute · Goals active ─────────────────────── */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20 }}>
        <BottomBar
          activeTab={_navTab}
          onTabChange={(tab) => {
            setNavTab(tab);
            onTabChange?.(tab);
          }}
        />
      </div>
    </div>
  );
}