import React, { useState, useRef, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Atom/Tab/Pill-Group
// Figma spec:
//   • Container: horizontal auto-layout · bg #FFFFFF · border 1px #EDE5DE
//     radius 100px · padding 4px · gap 0
//   • Active pill:   bg #B8472A · radius 100px · padding 8px 20px
//                    14px Semibold #FFFFFF
//   • Inactive pill: transparent · padding 8px 20px
//                    14px Regular #6B5C54
//   • Component property: Active Tab = "Focus" | "Productivity" | "Habits"
//   • Animated sliding indicator (matches Figma interactive variant pattern)
// ─────────────────────────────────────────────────────────────────────────────

export type PillTab = "Focus" | "Productivity" | "Habits";

const TABS: PillTab[] = ["Focus", "Productivity", "Habits"];

export interface PillGroupProps {
  /** Component property: which tab is currently active */
  activeTab?: PillTab;
  /** Called when the user taps a tab */
  onTabChange?: (tab: PillTab) => void;
  className?: string;
}

export function PillGroup({
  activeTab: controlledActive,
  onTabChange,
  className = "",
}: PillGroupProps) {
  // Support both controlled and uncontrolled usage
  const [internalActive, setInternalActive] = useState<PillTab>("Focus");
  const activeTab = controlledActive ?? internalActive;

  // ── Sliding indicator ─────────────────────────────────────────────────────
  // We measure each pill's offsetLeft + offsetWidth to slide a background
  // rectangle behind the active label, giving the Figma "smart animate" feel.
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const idx = TABS.indexOf(activeTab);
    const el = pillRefs.current[idx];
    if (!el) return;
    setIndicatorStyle({
      left:  el.offsetLeft,
      width: el.offsetWidth,
    });
  }, [activeTab]);

  function handleSelect(tab: PillTab) {
    if (!controlledActive) setInternalActive(tab);
    onTabChange?.(tab);
  }

  return (
    <div
      className={`inline-flex items-center relative ${className}`}
      style={{
        background:   "var(--surface-card)",         // #FFFFFF
        border:       "1px solid var(--surface-border)", // #EDE5DE
        borderRadius: "var(--radius-pill)",           // 100px
        padding:      "4px",
        gap:          0,
      }}
      role="tablist"
      aria-label="View selector"
    >
      {/* ── Sliding active background ─────────────────────────────────── */}
      <span
        aria-hidden="true"
        className="absolute top-[4px] bottom-[4px]"
        style={{
          ...indicatorStyle,
          background:   "var(--accent-primary)",      // #B8472A
          borderRadius: "var(--radius-pill)",          // 100px
          transition:   "left 220ms cubic-bezier(0.34,1.56,0.64,1), width 220ms cubic-bezier(0.34,1.56,0.64,1)",
          pointerEvents:"none",
        }}
      />

      {/* ── Pill buttons ──────────────────────────────────────────────── */}
      {TABS.map((tab, i) => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            ref={el => { pillRefs.current[i] = el; }}
            role="tab"
            aria-selected={isActive}
            onClick={() => handleSelect(tab)}
            className="relative z-10 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-1 cursor-pointer"
            style={{
              borderRadius: "var(--radius-pill)",
              padding:      "8px 20px",
              background:   "transparent",
              border:       "none",
              fontFamily:   "var(--font-sf-pro)",
              fontSize:     "14px",
              fontWeight:   isActive
                              ? "var(--font-weight-semibold)"  // 600
                              : "var(--font-weight-regular)",  // 400
              lineHeight:   "var(--text-lh-140)",
              color:        isActive
                              ? "var(--text-on-accent)"        // #FFFFFF
                              : "var(--text-secondary)",       // #6B5C54
              whiteSpace:   "nowrap",
            }}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
