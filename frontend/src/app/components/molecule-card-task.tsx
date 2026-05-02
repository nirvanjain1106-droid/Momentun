import React from "react";
import { Layers, FileText, GitMerge, Calendar, Zap, Target } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Molecule/Card/Task
// Figma spec — two variants: State=Active / State=Inactive
//
// INACTIVE:
//   Width fill · radius 16px · bg #FFFFFF · border 1px #EDE5DE
//   Left border accent: inset 3px left · [category color]
//   Padding 14px 16px · vertical auto-layout · gap 6px · Shadow/Card
//   Row 1  Task name 15px Semibold #1A1210   |  Duration 12px Regular #9C8880
//   Row 2  Subtitle 13px Regular #6B5C54
//   Row 3  App-icon circles (20px) + avatar circles (20px, optional)
//
// ACTIVE:
//   Same structure; gradient bg 145° D8694A→B8472A→A03D22
//   Shine overlay top-45% 270°; clip ON; no left border accent
//   Task name → #FFFFFF  ·  Subtitle → rgba(255,255,255,0.80)
//   Duration → white pill (bg rgba(255,255,255,0.20), text #FFFFFF)
//
// Component properties: Task Name · Subtitle · Duration · Category Color · Show Avatars
// ──────────────────────────────────────────────────��─────────────────────────

export type TaskCardState = "Active" | "Inactive";

// ── Sub-types ─────────────────────────────────────────────────────────────────

export interface AppIconDef {
  Icon:   React.ElementType;
  color:  string;
  label?: string;
}

export interface AvatarDef {
  initials: string;
  color:    string;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_APP_ICONS: AppIconDef[] = [
  { Icon: Layers,   color: "#7B61FF", label: "Figma"   },
  { Icon: FileText, color: "#2D2D2D", label: "Notion"  },
  { Icon: GitMerge, color: "#5E6AD2", label: "Linear"  },
];

const DEFAULT_AVATARS: AvatarDef[] = [
  { initials: "AJ", color: "#D4920A" },
  { initials: "KL", color: "#E05C7A" },
];

// ── Small helpers ─────────────────────────────────────────────────────────────

function AppIconCircle({ Icon, color, label }: AppIconDef) {
  return (
    <div
      title={label}
      aria-label={label}
      style={{
        width:           "20px",
        height:          "20px",
        borderRadius:    "50%",
        backgroundColor: color,
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        flexShrink:      0,
      }}
    >
      <Icon size={10} color="#FFFFFF" strokeWidth={2.5} aria-hidden="true" />
    </div>
  );
}

function AvatarCircle({ initials, color }: AvatarDef) {
  return (
    <div
      aria-label={initials}
      style={{
        width:           "20px",
        height:          "20px",
        borderRadius:    "50%",
        backgroundColor: color,
        border:          "1.5px solid rgba(255,255,255,0.80)",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        flexShrink:      0,
        fontFamily:      "var(--font-sf-pro)",
        fontSize:        "7px",
        fontWeight:      "var(--font-weight-bold)",
        color:           "var(--text-on-accent)",   // white initials on colored avatar
        letterSpacing:   "0.03em",
      }}
    >
      {initials}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────���─────────────────

export interface TaskCardProps {
  /** Figma: variant selector */
  state?: TaskCardState;
  /** Component property: Task Name */
  taskName?: string;
  /** Component property: Subtitle */
  subtitle?: string;
  /** Component property: Duration */
  duration?: string;
  /** Component property: Category Color (inactive left accent) */
  categoryColor?: string;
  /** Component property: Show Avatars */
  showAvatars?: boolean;
  /** App icon definitions (2-3) */
  appIcons?: AppIconDef[];
  /** Collaborator avatar definitions */
  avatars?: AvatarDef[];
  className?: string;
}

export function TaskCard({
  state         = "Inactive",
  taskName      = "Design System Review",
  subtitle      = "Figma · Notion · Linear sync",
  duration      = "90m",
  categoryColor = "#6C63FF",
  showAvatars   = true,
  appIcons      = DEFAULT_APP_ICONS,
  avatars       = DEFAULT_AVATARS,
  className     = "",
}: TaskCardProps) {
  const isActive   = state === "Active";
  const displayIcons = appIcons.slice(0, 3);

  // ── Shared inner content ───────────────────────────────────────────────────
  const content = (
    <div
      className="flex flex-col"
      style={{ padding: "14px 16px", gap: "6px" }}
    >
      {/* Row 1 — Task name + Duration ─────────────────────────────────────── */}
      <div className="flex items-start justify-between" style={{ gap: "8px" }}>
        <span
          className="flex-1 min-w-0"
          style={{
            fontFamily:   "var(--font-sf-pro)",
            fontSize:     "var(--text-body-size)",     // 15px
            fontWeight:   "var(--font-weight-semibold)",
            lineHeight:   "var(--text-lh-140)",
            color:        isActive ? "var(--text-on-accent)" : "var(--text-primary)",  // #FFFFFF on coral
            overflow:     "hidden",
            display:      "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
          }}
        >
          {taskName}
        </span>

        {/* Duration — plain text (inactive) or white pill (active) */}
        {isActive ? (
          <span
            style={{
              fontFamily:   "var(--font-sf-pro)",
              fontSize:     "var(--text-caption-size)",
              fontWeight:   "var(--font-weight-regular)",
              lineHeight:   "var(--text-lh-140)",
              color:        "var(--text-on-accent)",   // #FFFFFF on coral bg
              background:   "rgba(255,255,255,0.20)",
              borderRadius: "var(--radius-pill)",
              padding:      "2px 8px",
              flexShrink:   0,
              whiteSpace:   "nowrap",
            }}
          >
            {duration}
          </span>
        ) : (
          <span
            style={{
              fontFamily:  "var(--font-sf-pro)",
              fontSize:    "var(--text-caption-size)", // 12px
              fontWeight:  "var(--font-weight-regular)",
              lineHeight:  "var(--text-lh-140)",
              color:       "var(--text-muted)",         // #9C8880
              flexShrink:  0,
              whiteSpace:  "nowrap",
            }}
          >
            {duration}
          </span>
        )}
      </div>

      {/* Row 2 — Subtitle ───────────────────────────────────────────────────── */}
      <span
        style={{
          fontFamily:  "var(--font-sf-pro)",
          fontSize:    "13px",
          fontWeight:  "var(--font-weight-regular)",
          lineHeight:  "var(--text-lh-140)",
          color:       isActive ? "rgba(255,255,255,0.80)" : "var(--text-secondary)",
          overflow:    "hidden",
          display:     "-webkit-box",
          WebkitLineClamp: 1,
          WebkitBoxOrient: "vertical",
        }}
      >
        {subtitle}
      </span>

      {/* Row 3 — App icons + avatars ─────────────────────────────────────────── */}
      <div className="flex items-center" style={{ gap: "8px", marginTop: "2px" }}>
        {displayIcons.map((icon, i) => (
          <AppIconCircle key={i} {...icon} />
        ))}

        {/* Subtle separator dot when both icons and avatars are visible */}
        {showAvatars && avatars.length > 0 && (
          <span
            aria-hidden="true"
            style={{
              width:           "3px",
              height:          "3px",
              borderRadius:    "50%",
              backgroundColor: isActive ? "rgba(255,255,255,0.40)" : "var(--text-muted)",
              flexShrink:      0,
            }}
          />
        )}

        {showAvatars &&
          avatars.map((av, i) => <AvatarCircle key={i} {...av} />)}
      </div>
    </div>
  );

  // ── ACTIVE variant ─────────────────────────────────────────────────────────
  if (isActive) {
    return (
      <div
        className={`relative w-full overflow-hidden ${className}`}
        style={{
          borderRadius: "var(--radius-card)",
          boxShadow:    "var(--shadow-card)",
          background: "var(--accent-primary)",
        }}
      >
        {content}
      </div>
    );
  }

  // ── INACTIVE variant ───────────────────────────────────────────────────────
  // Left accent via inset box-shadow (avoids layout side-effects, respects radius clip)
  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{
        borderRadius: "var(--radius-card)",
        background:   "var(--surface-card)",
        border:       "1px solid var(--surface-border)",
        // Inset accent (3px left) + card shadow layered together
        boxShadow:    `inset 3px 0 0 0 ${categoryColor}, var(--shadow-card)`,
      }}
    >
      {content}
    </div>
  );
}

// ── Preset category colors (convenience export for showcase / consumers) ──────
export const CATEGORY_COLORS = {
  indigo: "#6C63FF",
  teal:   "var(--goal-ring-teal)",   // #2E9FD4
  amber:  "var(--status-energy)",    // #D4920A
  rose:   "var(--goal-ring-pink)",   // #E05C7A
  green:  "var(--goal-ring-green)",  // #1A7A4A
  accent: "var(--accent-primary)",   // #B8472A
} as const;

// ── Variant-specific app icon sets (convenience export) ───────────────────────
export const APP_ICON_SETS = {
  design: [
    { Icon: Layers,   color: "#7B61FF", label: "Figma"    },
    { Icon: FileText, color: "#2D2D2D", label: "Notion"   },
    { Icon: GitMerge, color: "#5E6AD2", label: "Linear"   },
  ],
  fitness: [
    { Icon: Zap,      color: "#D4920A", label: "Training" },
    { Icon: Target,   color: "#E05C7A", label: "Goals"    },
    { Icon: Calendar, color: "#2E9FD4", label: "Schedule" },
  ],
  planning: [
    { Icon: Calendar, color: "#4A90D9", label: "Calendar" },
    { Icon: Target,   color: "#1A7A4A", label: "OKRs"     },
    { Icon: FileText, color: "#6B5C54", label: "Docs"     },
  ],
} satisfies Record<string, AppIconDef[]>;