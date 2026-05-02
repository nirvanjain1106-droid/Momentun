import React, { useState } from "react";
import {
  ChevronDown, CalendarDays, AlignJustify,
  Layers, FileText, Target,
  Video, Users, Calendar,
  BookOpen, Image,
  Coffee, Leaf,
  Search, MessageSquare, ChartBar,
  Zap, Activity, Heart,
  Moon, PenLine,
} from "lucide-react";
import { PrimaryButton }  from "./atom-button-primary";
import { TaskCard }        from "./molecule-card-task";
import { BottomBar }       from "./molecule-nav-bottom-bar";
import type { BottomBarTab } from "./molecule-nav-bottom-bar";
import type { AppIconDef, AvatarDef } from "./molecule-card-task";

// ─────────────────────────────────────────────────────────────────────────────
// Screen/Tasks — 390 × 844px  ·  Background #FAF6F2
//
// Layer stack (top → bottom):
// ┌──────────────────────────────┐
// │  Status bar       54px       │  transparent
// ├──────────────────────────────┤
// │  Tasks header     56px       │  pad 0 16px · "Today ∨" + date · icons
// ├──────────────────────────────┤
// │  Calendar strip   80px       │  pad 0 16px · 7-day selector · THU 16 active
// ├──────────────────────────────┤
// │  Add task btn     ~68px      │  pad 0 16px · Atom/Button/Primary fill
// ├──────────────────────────────┤
// │  Task timeline    flex-1     │  scrollable · pad 0 16px · pb 80px
// │  (7 tasks with timeline)     │
// ├──────────────────────────────┤
// │  Bottom nav       80px       │  absolute · bottom 0 · Tasks active
// └──────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

// ══ 1. Status Bar ════════════════════════════════════════════════════════════

function StatusBar() {
  return (
    <div
      aria-hidden="true"
      style={{
        height:         "54px",
        flexShrink:     0,
        display:        "flex",
        alignItems:     "flex-end",
        justifyContent: "space-between",
        paddingLeft:    "24px",
        paddingRight:   "24px",
        paddingBottom:  "10px",
        background:     "transparent",
      }}
    >
      <span
        style={{
          fontFamily:    "var(--font-sf-pro)",
          fontSize:      "15px",
          fontWeight:    "var(--font-weight-semibold)",
          lineHeight:    1,
          color:         "var(--text-primary)",
          letterSpacing: "-0.01em",
        }}
      >
        9:41
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
          <rect x="0"    y="7" width="3" height="5"  rx="0.75" fill="var(--text-primary)" />
          <rect x="4.5"  y="5" width="3" height="7"  rx="0.75" fill="var(--text-primary)" />
          <rect x="9"    y="3" width="3" height="9"  rx="0.75" fill="var(--text-primary)" />
          <rect x="13.5" y="0" width="3" height="12" rx="0.75" fill="var(--text-primary)" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path d="M8 9.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" fill="var(--text-primary)" />
          <path d="M3.76 7.05a6 6 0 0 1 8.48 0"
            stroke="var(--text-primary)" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M1.17 4.46A9.5 9.5 0 0 1 14.83 4.46"
            stroke="var(--text-primary)" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3.5"
            stroke="var(--text-primary)" strokeOpacity="0.35" />
          <rect x="22.5" y="3.5" width="2" height="5" rx="1.25"
            fill="var(--text-primary)" fillOpacity="0.4" />
          <rect x="2" y="2" width="17" height="8" rx="2.25" fill="var(--text-primary)" />
        </svg>
      </div>
    </div>
  );
}

// ══ 2. Tasks Header ══════════════════════════════════════════════════════════

function TasksHeader() {
  return (
    <div
      style={{
        height:         "56px",
        flexShrink:     0,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "0 16px",
        boxSizing:      "border-box",
      }}
    >
      {/* Left: title + date */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {/* "Today ∨" — 22px Semibold #1A1210 */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span
            style={{
              fontFamily:    "var(--font-sf-pro)",
              fontSize:      "22px",
              fontWeight:    "var(--font-weight-semibold)",
              lineHeight:    "var(--text-lh-140)",
              color:         "var(--text-primary)",
              letterSpacing: "-0.2px",
            }}
          >
            Today
          </span>
          <ChevronDown
            size={18}
            strokeWidth={2.2}
            style={{ color: "var(--text-primary)", marginTop: "1px", flexShrink: 0 }}
            aria-hidden="true"
          />
        </div>
        {/* "May 16, 2024" — 13px Regular #9C8880 */}
        <span
          style={{
            fontFamily: "var(--font-sf-pro)",
            fontSize:   "13px",
            fontWeight: "var(--font-weight-regular)",
            lineHeight: "var(--text-lh-140)",
            color:      "var(--text-muted)",
          }}
        >
          May 16, 2024
        </span>
      </div>

      {/* Right: Calendar + Menu icons */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <button
          type="button"
          aria-label="Calendar"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            display: "flex",
          }}
        >
          <CalendarDays
            size={24}
            strokeWidth={1.75}
            style={{ color: "var(--text-primary)" }}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          aria-label="Menu"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            display: "flex",
          }}
        >
          <AlignJustify
            size={24}
            strokeWidth={1.75}
            style={{ color: "var(--text-primary)" }}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}

// ══ 3. Calendar Strip ════════════════════════════════════════════════════════

interface CalDay {
  abbr:       string;   // "MON", "TUE" …
  date:       number;   // 13 … 19
  isSelected: boolean;  // true for THU 16
  hasTask:    boolean;  // shows dot below date
}

const CALENDAR_DAYS: CalDay[] = [
  { abbr: "MON", date: 13, isSelected: false, hasTask: false },
  { abbr: "TUE", date: 14, isSelected: false, hasTask: false },
  { abbr: "WED", date: 15, isSelected: false, hasTask: false },
  { abbr: "THU", date: 16, isSelected: true,  hasTask: true  },
  { abbr: "FRI", date: 17, isSelected: false, hasTask: false },
  { abbr: "SAT", date: 18, isSelected: false, hasTask: false },
  { abbr: "SUN", date: 19, isSelected: false, hasTask: false },
];

function CalendarStrip() {
  return (
    <div
      style={{
        height:     "80px",
        flexShrink: 0,
        padding:    "0 16px",
        display:    "flex",
        alignItems: "center",
        boxSizing:  "border-box",
      }}
    >
      {/* 7-column grid — equal width */}
      <div
        style={{
          width:   "100%",
          display: "flex",
          gap:     "0",
        }}
      >
        {CALENDAR_DAYS.map((day) => (
          <div
            key={day.date}
            style={{
              flex:           1,
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              gap:            "4px",
            }}
          >
            {/* Day abbreviation — 11px Regular #9C8880 */}
            <span
              style={{
                fontFamily: "var(--font-sf-pro)",
                fontSize:   "11px",
                fontWeight: "var(--font-weight-regular)",
                lineHeight: "var(--text-lh-140)",
                color:      "var(--text-muted)",
                letterSpacing: "0.02em",
              }}
            >
              {day.abbr}
            </span>

            {/* Date — circle (selected) or plain text (unselected)
                Both sit inside a 36px × 36px bounding box for alignment */}
            <div
              style={{
                width:           "36px",
                height:          "36px",
                borderRadius:    "50%",
                background:      day.isSelected ? "var(--accent-primary)" : "transparent",
                display:         "flex",
                alignItems:      "center",
                justifyContent:  "center",
                flexShrink:      0,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-sf-pro)",
                  fontSize:   "16px",
                  fontWeight: "var(--font-weight-semibold)",
                  lineHeight: 1,
                  color:      day.isSelected ? "var(--text-on-accent)" : "var(--text-primary)",
                }}
              >
                {day.date}
              </span>
            </div>

            {/* Task dot — 5px circle, only for days with tasks (THU 16) */}
            <div
              style={{
                width:        "5px",
                height:       "5px",
                borderRadius: "50%",
                background:   day.hasTask ? "var(--accent-primary)" : "transparent",
                flexShrink:   0,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ══ 4. Task data ══════════════════════════════════════════════════════════════

interface TaskDef {
  time:          string;
  taskName:      string;
  subtitle:      string;
  duration:      string;
  categoryColor: string;
  state:         "Active" | "Inactive";
  isCurrent:     boolean;
  showAvatars:   boolean;
  appIcons:      AppIconDef[];
  avatars?:      AvatarDef[];
}

const TASKS: TaskDef[] = [
  {
    time:          "9:00 AM",
    taskName:      "Deep Work Session",
    subtitle:      "Finish ABM Strategy Deck",
    duration:      "90m",
    categoryColor: "#6C63FF",
    state:         "Active",
    isCurrent:     true,
    showAvatars:   false,
    appIcons: [
      { Icon: Layers,   color: "#7B61FF", label: "Figma"    },
      { Icon: FileText, color: "#2D2D2D", label: "Notion"   },
      { Icon: Target,   color: "#B8472A", label: "Strategy" },
    ],
  },
  {
    time:          "9:30 AM",
    taskName:      "Marketing Sync",
    subtitle:      "Team Stand-up",
    duration:      "30m",
    categoryColor: "#2E9FD4",
    state:         "Inactive",
    isCurrent:     false,
    showAvatars:   true,
    appIcons: [
      { Icon: Video,    color: "#2E9FD4", label: "Zoom" },
      { Icon: Users,    color: "#4A90D9", label: "Team" },
      { Icon: Calendar, color: "#1A7A4A", label: "Cal"  },
    ],
    avatars: [
      { initials: "AJ", color: "#D4920A" },
      { initials: "KL", color: "#E05C7A" },
    ],
  },
  {
    time:          "11:00 AM",
    taskName:      "Content Review",
    subtitle:      "Review blog + social posts",
    duration:      "60m",
    categoryColor: "#F0A500",
    state:         "Inactive",
    isCurrent:     false,
    showAvatars:   false,
    appIcons: [
      { Icon: FileText, color: "#F0A500", label: "Docs"  },
      { Icon: Image,    color: "#D4795C", label: "Media" },
      { Icon: BookOpen, color: "#6B5C54", label: "Blog"  },
    ],
  },
  {
    time:          "12:30 PM",
    taskName:      "Lunch Break",
    subtitle:      "Rest & Recharge",
    duration:      "60m",
    categoryColor: "#1A7A4A",
    state:         "Inactive",
    isCurrent:     false,
    showAvatars:   false,
    appIcons: [
      { Icon: Coffee, color: "#D4795C", label: "Break" },
      { Icon: Leaf,   color: "#1A7A4A", label: "Rest"  },
    ],
  },
  {
    time:          "2:00 PM",
    taskName:      "User Research",
    subtitle:      "Interview analysis",
    duration:      "90m",
    categoryColor: "#D4795C",
    state:         "Inactive",
    isCurrent:     false,
    showAvatars:   false,
    appIcons: [
      { Icon: Search,        color: "#D4795C", label: "Research"   },
      { Icon: MessageSquare, color: "#2E9FD4", label: "Interviews" },
      { Icon: ChartBar,      color: "#6C63FF", label: "Analysis"   },
    ],
  },
  {
    time:          "3:30 PM",
    taskName:      "Workout",
    subtitle:      "Strength Training",
    duration:      "60m",
    categoryColor: "#E05C7A",
    state:         "Inactive",
    isCurrent:     false,
    showAvatars:   false,
    appIcons: [
      { Icon: Zap,      color: "#D4920A", label: "Training" },
      { Icon: Activity, color: "#E05C7A", label: "Fitness"  },
      { Icon: Heart,    color: "#C0392B", label: "Health"   },
    ],
  },
  {
    time:          "5:00 PM",
    taskName:      "Evening Reflection",
    subtitle:      "Plan tomorrow",
    duration:      "30m",
    categoryColor: "#9C8880",
    state:         "Inactive",
    isCurrent:     false,
    showAvatars:   false,
    appIcons: [
      { Icon: BookOpen, color: "#9C8880", label: "Journal" },
      { Icon: Moon,     color: "#6B5C54", label: "Evening" },
      { Icon: PenLine,  color: "#B8472A", label: "Plan"    },
    ],
  },
];

// ══ 5. Task timeline (scrollable list with time dots + connecting line) ═══════

// Layout per row:
//   [time col 52px] [spacer 8px] [dot col 8px] [spacer 8px] [card fill]
//
// The dot column uses flexDirection: column with three segments:
//   Top segment  (22px, 1px wide) — invisible on row 0, #EDE5DE otherwise
//   Dot          (8px circle)     — #B8472A (current) or #EDE5DE (other)
//   Bottom seg   (flex-1, 1px)    — #EDE5DE unless last row
//
// The card wrapper has paddingBottom: 12px (gap between rows) on all but the
// last row.  Since alignItems: stretch on the outer flex row, the dot col
// auto-extends to fill the card+gap height, keeping the line continuous.

function TaskTimeline() {
  const last = TASKS.length - 1;

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        paddingTop:    "8px",
      }}
    >
      {TASKS.map((task, i) => (
        <div
          key={task.time}
          style={{
            display:    "flex",
            alignItems: "stretch",
          }}
        >
          {/* ── Time label ───────────────────────────────────────────── */}
          <div
            style={{
              width:      "52px",
              flexShrink: 0,
              // paddingTop aligns text with first line of card content (14px card padding)
              paddingTop: "18px",
              textAlign:  "right",
              boxSizing:  "border-box",
            }}
          >
            <span
              style={{
                fontFamily:  "var(--font-sf-pro)",
                fontSize:    "11px",
                fontWeight:  "var(--font-weight-regular)",
                lineHeight:  "var(--text-lh-140)",
                color:       "var(--text-muted)",
                whiteSpace:  "nowrap",
              }}
            >
              {task.time}
            </span>
          </div>

          {/* ── Gap ──────────────────────────────────────────────────── */}
          <div style={{ width: "8px", flexShrink: 0 }} />

          {/* ── Dot column + connecting line ─────────────────────────── */}
          <div
            style={{
              width:          "8px",
              flexShrink:     0,
              alignSelf:      "stretch",
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
            }}
          >
            {/* Top segment — connects from previous dot to this dot */}
            <div
              style={{
                width:      "1px",
                height:     "22px",
                flexShrink: 0,
                background: i === 0 ? "transparent" : "var(--surface-border)",
              }}
            />

            {/* Dot — 8px circle */}
            <div
              style={{
                width:        "8px",
                height:       "8px",
                borderRadius: "50%",
                flexShrink:   0,
                background:   task.isCurrent
                  ? "var(--accent-primary)"  // #B8472A
                  : "var(--surface-border)", // #EDE5DE
                zIndex:       1,
              }}
            />

            {/* Bottom segment — fills remaining height including card gap */}
            <div
              style={{
                width:      "1px",
                flex:       1,
                background: i < last ? "var(--surface-border)" : "transparent",
              }}
            />
          </div>

          {/* ── Gap ──────────────────────────────────────────────────── */}
          <div style={{ width: "8px", flexShrink: 0 }} />

          {/* ── Task card ────────────────────────────────────────────── */}
          {/* paddingBottom creates the 12px gap AND extends the dot line */}
          <div
            style={{
              flex:         1,
              minWidth:     0,
              paddingBottom: i < last ? "12px" : 0,
            }}
          >
            <TaskCard
              state={task.state}
              taskName={task.taskName}
              subtitle={task.subtitle}
              duration={task.duration}
              categoryColor={task.categoryColor}
              showAvatars={task.showAvatars}
              appIcons={task.appIcons}
              avatars={task.avatars}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ══ 6. Screen/Tasks shell ════════════════════════════════════════════════════

export interface ScreenTasksProps {
  activeTab?:   BottomBarTab;
  onTabChange?: (tab: BottomBarTab) => void;
}

export function ScreenTasks({
  activeTab   = "Tasks",
  onTabChange,
}: ScreenTasksProps) {
  const [_active, setActive] = useState<BottomBarTab>(activeTab);
  const current = _active;

  return (
    <div
      style={{
        width:         "390px",
        height:        "844px",
        flexShrink:    0,
        background:    "var(--bg-base)",
        overflow:      "hidden",
        position:      "relative",
        display:       "flex",
        flexDirection: "column",
      }}
    >

      {/* ── 1. Status bar ─────────────────────────────────────────────── */}
      <StatusBar />

      {/* ── 2. Tasks header ───────────────────────────────────────────── */}
      <TasksHeader />

      {/* ── 3. Calendar strip ─────────────────────────────────────────── */}
      <CalendarStrip />

      {/* ── 4. Thin divider under calendar ────────────────────────────── */}
      <div
        style={{
          height:     "1px",
          flexShrink: 0,
          background: "var(--divider)",
          margin:     "0 16px",
        }}
      />

      {/* ── 5. Add Task button ────────────────────────────────────────── */}
      <div
        style={{
          padding:    "8px 16px",
          flexShrink: 0,
          boxSizing:  "border-box",
        }}
      >
        <PrimaryButton label="+ Add Task" className="w-full" />
      </div>

      {/* ── 6. Scrollable task timeline ───────────────────────────────── */}
      <div
        style={{
          flex:                    1,
          overflowY:               "auto",
          overflowX:               "hidden",
          padding:                 "0 16px",
          paddingBottom:           "80px",
          WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
        }}
      >
        <TaskTimeline />
      </div>

      {/* ── 7. Bottom nav · absolute ──────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom:   0,
          left:     0,
          right:    0,
          zIndex:   20,
        }}
      >
        <BottomBar
          activeTab={current}
          onTabChange={(tab) => {
            setActive(tab);
            onTabChange?.(tab);
          }}
        />
      </div>

    </div>
  );
}