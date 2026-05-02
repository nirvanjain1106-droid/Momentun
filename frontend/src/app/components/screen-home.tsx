import React from "react";
import { BottomBar } from "./molecule-nav-bottom-bar";
import type { BottomBarTab } from "./molecule-nav-bottom-bar";

// ─────────────────────────────────────────────────────────────────────────────
// Screen/Home — iPhone 14 Pro frame shell
//
// Dimensions:  390 × 844 px
// Background:  #FAF6F2  (--bg-base)
// Clip:        overflow hidden
//
// Layer stack (top → bottom):
// ┌──────────────────────────────┐  ← 390 × 844px frame
// │  Status bar      54px        │  transparent bg · time + system icons
// ├──────────────────────────────┤
// │  Header slot     (optional)  │  non-scrolling · rendered between status & content
// ├──────────────────────────────┤
// │                              │
// │  Content area   flex-1       │  overflow-y auto · padding 0 16px
// │                              │  paddingBottom 80px (clears bottom nav)
// │                              │
// ├───────────────────��──────────┤
// │  Bottom Nav      80px        │  absolute · bottom 0 · full width
// └──────────────────────────────┘
//
// Component properties:
//   header       — non-scrolling slot between status bar and content (optional)
//   children     — content area slot (empty by default)
//   activeTab    — forwarded to BottomBar  (default "Home")
//   onTabChange  — forwarded to BottomBar
// ─────────────────────────────────────────────────────────────────────────────

export interface ScreenHomeProps {
  header?:      React.ReactNode;
  children?:    React.ReactNode;
  activeTab?:   BottomBarTab;
  onTabChange?: (tab: BottomBarTab) => void;
}

// ── Minimal iOS-style status bar ─────────────────────────────────────────────
function StatusBar() {
  return (
    <div
      aria-hidden="true"
      style={{
        height:      "54px",
        flexShrink:  0,
        display:     "flex",
        alignItems:  "flex-end",      // pin content to bottom of the 54px zone
        justifyContent: "space-between",
        paddingLeft:  "24px",
        paddingRight: "24px",
        paddingBottom: "10px",
        background:  "transparent",
        position:    "relative",
        zIndex:       10,
      }}
    >
      {/* Time */}
      <span
        style={{
          fontFamily:  "var(--font-sf-pro)",
          fontSize:    "15px",
          fontWeight:  "var(--font-weight-semibold)",
          lineHeight:  1,
          color:       "var(--text-primary)",
          letterSpacing: "-0.01em",
        }}
      >
        9:41
      </span>

      {/* System glyphs — Signal · WiFi · Battery */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>

        {/* Cellular signal bars */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
          <rect x="0"  y="7"  width="3" height="5" rx="0.75" fill="var(--text-primary)" />
          <rect x="4.5" y="5" width="3" height="7" rx="0.75" fill="var(--text-primary)" />
          <rect x="9"  y="3"  width="3" height="9" rx="0.75" fill="var(--text-primary)" />
          <rect x="13.5" y="0" width="3" height="12" rx="0.75" fill="var(--text-primary)" />
        </svg>

        {/* WiFi */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path d="M8 9.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z"
            fill="var(--text-primary)" />
          <path d="M3.76 7.05a6 6 0 0 1 8.48 0"
            stroke="var(--text-primary)" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M1.17 4.46A9.5 9.5 0 0 1 14.83 4.46"
            stroke="var(--text-primary)" strokeWidth="1.4" strokeLinecap="round" />
        </svg>

        {/* Battery */}
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3.5"
            stroke="var(--text-primary)" strokeOpacity="0.35" />
          <rect x="22.5" y="3.5" width="2" height="5" rx="1.25"
            fill="var(--text-primary)" fillOpacity="0.4" />
          <rect x="2" y="2" width="17" height="8" rx="2.25"
            fill="var(--text-primary)" />
        </svg>

      </div>
    </div>
  );
}

// ── Screen/Home shell ─────────────────────────────────────────────────────────
export function ScreenHome({
  header,
  children,
  activeTab   = "Home",
  onTabChange,
}: ScreenHomeProps) {
  return (
    <div
      style={{
        // Frame dimensions
        width:        "390px",
        height:       "844px",
        flexShrink:   0,

        // Background
        background:   "var(--bg-base)",          // #FAF6F2

        // Clip content
        overflow:     "hidden",

        // Relative so the absolute bottom nav is scoped inside
        position:     "relative",

        // Vertical stack
        display:      "flex",
        flexDirection:"column",
      }}
    >

      {/* ── 1. Status bar · 54px ─────────────────────────────────────────── */}
      <StatusBar />

      {/* ── 2. Header slot · non-scrolling (optional) ───────────────────── */}
      {header}

      {/* ── 3. Content area · flex-1 · scrollable ───────────────────────── */}
      <div
        style={{
          flex:          1,
          overflowY:     "auto",
          overflowX:     "hidden",
          padding:       "0 16px",
          // Extra bottom padding reserves space so content clears the nav bar
          paddingBottom: "80px",
          // Smooth momentum scrolling on iOS
          WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
        }}
      >
        {children}
      </div>

      {/* ── 4. Bottom nav · 80px · absolute-fixed to frame bottom ───────── */}
      <div
        style={{
          position: "absolute",
          bottom:   0,
          left:     0,
          right:    0,
          zIndex:   20,
        }}
      >
        <BottomBar activeTab={activeTab} onTabChange={onTabChange} />
      </div>

    </div>
  );
}