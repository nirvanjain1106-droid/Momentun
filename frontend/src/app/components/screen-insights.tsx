import React, { useState } from "react";
import { Info, Flame, Zap } from "lucide-react";
import { DeltaBadge } from "./atom-badge-delta";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceDot,
} from "recharts";
import { PillGroup }  from "./atom-tab-pill-group";
import type { PillTab } from "./atom-tab-pill-group";
import { BottomBar }  from "./molecule-nav-bottom-bar";
import type { BottomBarTab } from "./molecule-nav-bottom-bar";

// ─────────────────────────────────────────────────────────────────────────────
// Screen/Insights — 390 × 844 px  ·  Background #FAF6F2
// ─────────────────────────────────────────────────────────────────────────────

// 1. Status bar
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

// 2. Screen header
function InsightsHeader() {
  return (
    <div
      className="glass-header glass-shine"
      style={{
      position: "relative",
      height: "56px", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 16px",
    }}>
      <span style={{
        fontFamily: "var(--font-sf-pro)",
        fontSize: "22px",
        fontWeight: "var(--font-weight-bold)",
        lineHeight: "var(--text-lh-140)",
        color: "var(--text-primary)",
        letterSpacing: "-0.2px",
      }}>Insights</span>
      <button type="button" aria-label="More info" style={{
        background: "transparent", border: "none", cursor: "pointer",
        padding: 0, display: "flex",
      }}>
        <Info size={20} strokeWidth={1.75}
          style={{ color: "var(--text-muted)" }} aria-hidden="true" />
      </button>
    </div>
  );
}

// 3. Stat cards
function StatCardShell({ children, style }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: "#FFFFFF",
      border: "1px solid #EDE5DE",
      borderRadius: "16px",
      padding: "16px 8px",
      display: "flex", flexDirection: "column",
      alignItems: "center", gap: "4px",
      textAlign: "center",
      ...style,
    }}>
      {children}
    </div>
  );
}

function StreakCard() {
  return (
    <StatCardShell>
      <Flame size={24} strokeWidth={0}
        style={{ color: "#B8472A", fill: "#B8472A", flexShrink: 0 }}
        aria-hidden="true" />
      <span style={{
        fontFamily: "var(--font-sf-pro)", fontSize: "12px",
        fontWeight: "var(--font-weight-regular)",
        lineHeight: "var(--text-lh-140)", color: "#9C8880",
      }}>Current Streak</span>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "3px" }}>
        <span style={{
          fontFamily: "var(--font-sf-pro)", fontSize: "28px",
          fontWeight: "var(--font-weight-bold)", lineHeight: 1,
          color: "#1A1210", letterSpacing: "-0.2px",
        }}>7</span>
        <span style={{
          fontFamily: "var(--font-sf-pro)", fontSize: "12px",
          fontWeight: "var(--font-weight-regular)",
          lineHeight: "var(--text-lh-140)", color: "#9C8880",
          paddingBottom: "3px",
        }}>Days</span>
      </div>
      <span style={{
        fontFamily: "var(--font-sf-pro)", fontSize: "12px",
        fontWeight: "var(--font-weight-semibold)",
        color: "#1A7A4A", marginTop: "4px"
      }}>Keep it up!</span>
    </StatCardShell>
  );
}

const RING_R          = 25;
const RING_CIRCUM     = 2 * Math.PI * RING_R;
const RING_FILL       = 0.78;
const RING_DASH_OFFSET = RING_CIRCUM * (1 - RING_FILL);

function CompletionRing() {
  return (
    <svg
      width="56" height="56"
      viewBox="0 0 56 56"
      role="img"
      aria-label="78% completion rate"
      style={{ flexShrink: 0 }}
    >
      <circle
        cx="28" cy="28" r={RING_R}
        stroke="#EDE5DE" strokeWidth="6"
        fill="none"
      />
      <circle
        cx="28" cy="28" r={RING_R}
        stroke="#3A3A3A" strokeWidth="6"
        fill="none"
        strokeDasharray={RING_CIRCUM}
        strokeDashoffset={RING_DASH_OFFSET}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
      />
      <text
        x="28" y="28"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-sf-pro)"
        fontSize="20"
        fontWeight="bold"
        fill="#1A1210"
      >78%</text>
    </svg>
  );
}

function CompletionCard() {
  return (
    <StatCardShell>
      <CompletionRing />
      <span style={{
        fontFamily: "var(--font-sf-pro)", fontSize: "11px",
        fontWeight: "var(--font-weight-semibold)",
        color: "#B8472A", background: "#F5E8E4",
        borderRadius: "100px", padding: "2px 8px",
        whiteSpace: "nowrap", marginTop: "4px"
      }}>This Week</span>
    </StatCardShell>
  );
}

function EnergyCard() {
  return (
    <StatCardShell>
      <Zap size={24} strokeWidth={0}
        style={{ color: "#D4920A", fill: "#D4920A", flexShrink: 0 }}
        aria-hidden="true" />
      <span style={{
        fontFamily: "var(--font-sf-pro)", fontSize: "12px",
        fontWeight: "var(--font-weight-regular)",
        lineHeight: "var(--text-lh-140)", color: "#9C8880",
      }}>Energy Score</span>
      <span style={{
        fontFamily: "var(--font-sf-pro)", fontSize: "18px",
        fontWeight: "var(--font-weight-bold)", lineHeight: 1,
        color: "#1A1210", letterSpacing: "-0.2px", margin: "4px 0"
      }}>85 / 100</span>
      <span style={{
        fontFamily: "var(--font-sf-pro)", fontSize: "12px",
        fontWeight: "var(--font-weight-semibold)",
        color: "#1A7A4A", marginTop: "2px"
      }}>High</span>
    </StatCardShell>
  );
}

// 4. Focus Time Card
const FOCUS_WEEK_DATA = [
  { day: "Mon", hours: 2.0 },
  { day: "Tue", hours: 3.2 },
  { day: "Wed", hours: 3.5 },
  { day: "Thu", hours: 5.8 },
  { day: "Fri", hours: 2.8 },
  { day: "Sat", hours: 1.0 },
  { day: "Sun", hours: 0.4 },
];

function FocusTimeCard() {
  return (
    <div style={{
      background: "#FFFFFF",
      border: "1px solid #EDE5DE",
      borderRadius: "16px",
      padding: "16px",
    }}>
      <span style={{
        display: "block",
        fontFamily: "var(--font-sf-pro)", fontSize: "14px",
        fontWeight: "var(--font-weight-semibold)",
        lineHeight: "var(--text-lh-140)", color: "var(--text-primary)",
        marginBottom: "10px",
      }}>Focus Time (This Week)</span>

      <div style={{
        display: "flex", alignItems: "flex-end",
        justifyContent: "space-between", gap: "8px",
        marginBottom: "14px",
      }}>
        <span style={{
          fontFamily: "var(--font-sf-pro)", fontSize: "34px",
          fontWeight: "var(--font-weight-bold)", lineHeight: 1,
          color: "var(--text-primary)", letterSpacing: "-0.2px",
        }}>18h 42m</span>

        <div style={{ paddingBottom: "4px" }}>
          <DeltaBadge direction="up" label="12% vs last week" />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={128}>
        <AreaChart id="insights-focus-weekly" data={FOCUS_WEEK_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
          <CartesianGrid
            key="grid"
            horizontal vertical={false}
            stroke="var(--divider)" strokeWidth={0.5} strokeDasharray=""
          />
          <XAxis
            key="x-axis"
            dataKey="day"
            tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-sf-pro)" }}
            tickLine={false} axisLine={false} dy={4}
          />
          <YAxis
            key="y-axis"
            domain={[0, 18]}
            ticks={[0, 6, 12, 18]}
            tickFormatter={(v) => `${v}h`}
            tick={{ fontSize: 11, fill: "#9C8880", fontFamily: "var(--font-sf-pro)", fontWeight: "var(--font-weight-regular)" }}
            tickLine={false} axisLine={false}
            width={28}
          />
          <Area
            key="area"
            type="monotone"
            dataKey="hours"
            stroke="#C4603A" strokeWidth={2}
            fill="rgba(184,71,42,0.08)"
            isAnimationActive={false}
            dot={false}
            activeDot={{ fill: "#C4603A", stroke: "#FFFFFF", strokeWidth: 1.5, r: 4 }}
          />
          <ReferenceDot
            key="ref-dot"
            x="Thu" y={5.8}
            r={3}
            fill="#C4603A" stroke="#FFFFFF" strokeWidth={1.5}
            isFront
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// 5. Heatmap Card
const HEAT_DAYS  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const HEAT_TIMES = ["6AM", "9AM", "12PM", "3PM", "6PM", "9PM"] as const;
const HEAT_COLORS = [
  "#F5E8E4",
  "#F0D0C4",
  "#D4795C",
  "#C4603A",
  "#B8472A",
  "#8C3520",
] as const;

const HEAT_DATA: number[][] = [
  [1, 0, 1, 2, 0, 0, 0],
  [3, 2, 4, 4, 2, 1, 0],
  [2, 3, 3, 5, 3, 1, 0],
  [3, 2, 3, 4, 2, 0, 0],
  [1, 1, 2, 2, 1, 0, 0],
  [0, 0, 1, 1, 0, 0, 0],
];

const LEGEND_DOTS = [
  "#F5E8E4", "#F0D0C4", "#D4795C", "#C4603A", "#B8472A",
] as const;

function HeatmapCard() {
  const cells: React.ReactNode[] = [];

  cells.push(<div key="corner" aria-hidden="true" />);
  HEAT_DAYS.forEach((d) =>
    cells.push(
      <div key={`h-${d}`} style={{
        fontFamily: "var(--font-sf-pro)", fontSize: "10px",
        fontWeight: "var(--font-weight-regular)",
        color: "var(--text-muted)",
        textAlign: "center", alignSelf: "center",
      }}>{d}</div>
    )
  );

  HEAT_TIMES.forEach((time, r) => {
    cells.push(
      <div key={`l-${r}`} style={{
        fontFamily: "var(--font-sf-pro)", fontSize: "10px",
        fontWeight: "var(--font-weight-regular)",
        color: "var(--text-muted)",
        textAlign: "right", alignSelf: "center", paddingRight: "4px",
      }}>{time}</div>
    );
    HEAT_DAYS.forEach((_, c) =>
      cells.push(
        <div key={`${r}-${c}`} style={{
          height: "18px", borderRadius: "4px",
          background: HEAT_COLORS[HEAT_DATA[r][c]],
        }} />
      )
    );
  });

  return (
    <div style={{
      background: "var(--surface-card)",
      border: "1px solid var(--surface-border)",
      borderRadius: "var(--radius-card)",
      boxShadow: "var(--shadow-card)",
      padding: "16px",
    }}>
      <span style={{
        display: "block",
        fontFamily: "var(--font-sf-pro)", fontSize: "14px",
        fontWeight: "var(--font-weight-semibold)",
        lineHeight: "var(--text-lh-140)", color: "var(--text-primary)",
        marginBottom: "12px",
      }}>Focus Heatmap</span>

      <div style={{
        display: "grid",
        gridTemplateColumns: "30px repeat(7, 1fr)",
        gridAutoRows: "auto",
        columnGap: "3px", rowGap: "3px",
      }}>
        {cells}
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: "6px",
        marginTop: "10px", justifyContent: "flex-end",
      }}>
        <span style={{ fontFamily: "var(--font-sf-pro)", fontSize: "10px", color: "var(--text-muted)" }}>Low</span>
        {LEGEND_DOTS.map((color, i) => (
          <div key={i} style={{ width: "10px", height: "10px", borderRadius: "3px", background: color, flexShrink: 0 }} />
        ))}
        <span style={{ fontFamily: "var(--font-sf-pro)", fontSize: "10px", color: "var(--text-muted)" }}>High</span>
      </div>
    </div>
  );
}

// 6. Screen/Insights shell
export interface ScreenInsightsProps {
  activeTab?:      BottomBarTab;
  onTabChange?:    (tab: BottomBarTab) => void;
  activePillTab?:  PillTab;
  onPillChange?:   (tab: PillTab) => void;
}

export function ScreenInsights({
  activeTab      = "Insights",
  onTabChange,
  activePillTab  = "Focus",
  onPillChange,
}: ScreenInsightsProps) {
  const [_navTab,  setNavTab]  = useState<BottomBarTab>(activeTab);
  const [_pillTab, setPillTab] = useState<PillTab>(activePillTab);

  return (
    <div style={{
      width: "390px", height: "844px", flexShrink: 0,
      background: "var(--bg-base)",
      overflow: "hidden", position: "relative",
    }}>

      {/* Y: 0 — Status bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 50 }}>
        <StatusBar />
      </div>

      {/* Scrollable Area starting at Y: 54px */}
      <div style={{
        position: "absolute", top: "54px", bottom: "80px", left: 0, right: 0,
        overflowY: "auto", overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
      }}>
        
        {/* Y: 54px (offset 0) */}
        <InsightsHeader />

        {/* Y: 110px (offset 56) */}
        <div style={{ height: "54px", display: "flex", alignItems: "center", padding: "0 16px" }}>
          <PillGroup
            activeTab={_pillTab}
            onTabChange={(tab) => {
              setPillTab(tab);
              onPillChange?.(tab);
            }}
            className="w-full"
          />
        </div>

        {/* Y: 164px (offset 110) */}
        <div style={{
          display: "flex", flexDirection: "column", gap: "16px",
          padding: "0 16px 16px",
        }}>
          {/* Stat row */}
          <div style={{ display: "flex", gap: "8px" }}>
            <StreakCard />
            <CompletionCard />
            <EnergyCard />
          </div>

          {/* Additional Content */}
          <FocusTimeCard />
          <HeatmapCard />
        </div>
      </div>

      {/* Bottom Nav */}
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
