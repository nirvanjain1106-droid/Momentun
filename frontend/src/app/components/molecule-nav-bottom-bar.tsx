import React, { useState } from "react";
import { Home, ClipboardList, BarChart2, Target, User } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Molecule/Nav/Bottom-Bar
// Figma spec:
//   • Frame: 390px × 80px · bg #FFFFFF
//   • Border: top 0.5px #EDE5DE (hairline) + Shadow/Tab-Bar
//   • Layout: horizontal · space-between · padding 12px 20px 34px
//   • 5 equal items: vertical auto-layout · center · gap 4px
//   • Active:   icon fill #B8472A · label 11px Semibold #B8472A
//   • Inactive: icon outline #9C8880 · label 11px Regular  #9C8880
//   • Component property: Active Tab = Home | Tasks | Insights | Goals | Profile
//
// Icon treatment (SF Symbols-style fill/outline toggle):
//   • Active  → fill="currentColor" strokeWidth={0}   (solid shape)
//   • Inactive → fill="none"        strokeWidth={1.5} (outlined)
// ─────────────────────────────────────────────────────────────────────────────

export type BottomBarTab = "Home" | "Tasks" | "Insights" | "Goals" | "Profile";

interface NavItem {
  tab:   BottomBarTab;
  label: string;
  Icon:  React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { tab: "Home",     label: "Home",     Icon: Home         },
  { tab: "Tasks",    label: "Tasks",    Icon: ClipboardList },
  { tab: "Insights", label: "Insights", Icon: BarChart2     },
  { tab: "Goals",    label: "Goals",    Icon: Target        },
  { tab: "Profile",  label: "Profile",  Icon: User          },
];

export interface BottomBarProps {
  /**
   * Component property: which tab is currently active.
   * Pass `null` for sub-screens where no tab should be highlighted.
   */
  activeTab?:   BottomBarTab | null;
  onTabChange?: (tab: BottomBarTab) => void;
  className?:   string;
}

export function BottomBar({
  activeTab: controlledActive,
  onTabChange,
  className = "",
}: BottomBarProps) {
  const [internalActive, setInternalActive] = useState<BottomBarTab>("Home");
  // null = explicit "no active tab" (sub-screen); undefined = use internal state
  const activeTab = controlledActive !== undefined ? controlledActive : internalActive;

  function handleSelect(tab: BottomBarTab) {
    if (controlledActive === undefined) setInternalActive(tab);
    onTabChange?.(tab);
  }

  return (
    <nav
      className={`flex items-start justify-between ${className}`}
      aria-label="Main navigation"
      style={{
        width:        "390px",
        height:       "80px",
        flexShrink:   0,
        background:   "var(--surface-card)",             // #FFFFFF
        borderTop:    "0.5px solid var(--surface-border)", // hairline #EDE5DE
        boxShadow:    "var(--shadow-tab-bar)",
        padding:      "12px 20px 34px",                  // top · h · safe-area-bottom
      }}
    >
      {NAV_ITEMS.map(({ tab, label, Icon }) => {
        const isActive = tab === activeTab;  // null never matches, so all inactive
        const color    = isActive ? "var(--accent-primary)" : "var(--text-muted)";

        return (
          <button
            key={tab}
            role="tab"
            aria-selected={isActive}
            aria-label={label}
            onClick={() => handleSelect(tab)}
            className="flex flex-col items-center justify-start flex-1 bg-transparent border-none cursor-pointer"
            style={{ gap: "4px", padding: 0 }}
          >
            {/* Icon — filled (active) vs outlined (inactive) */}
            <Icon
              size={24}
              aria-hidden="true"
              fill={       isActive ? "currentColor" : "none"}
              strokeWidth={ isActive ? 0               : 1.5  }
              style={{
                color,
                transition: "color 160ms ease, fill 160ms ease",
                flexShrink: 0,
              }}
            />

            {/* Label — 11px Semibold (active) or Regular (inactive) */}
            <span
              style={{
                fontFamily: "var(--font-sf-pro)",
                fontSize:   "var(--text-label-small-size)",          // 11px
                fontWeight: isActive
                              ? "var(--font-weight-semibold)"        // 600
                              : "var(--font-weight-regular)",        // 400
                lineHeight: "var(--text-lh-120)",
                color,
                transition: "color 160ms ease, font-weight 160ms ease",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}