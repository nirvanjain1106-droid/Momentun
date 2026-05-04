import { useState } from "react";
import { Bell, Settings } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Screen/Home — Header
//
// Frame:   width fill · height 56px · horizontal · space-between · center-vertical
//          padding: 0 16px · background: transparent
//
// LEFT GROUP — horizontal · gap 10px · center-vertical
//   Avatar circle  36px · bg #F5E8E4 (--accent-tint) · initials #B8472A
//   Text column    vertical · gap 2px
//     greeting   13px Regular  #9C8880  (--text-muted)
//     name       17px Semibold #1A1210  (--text-primary)
//
// RIGHT GROUP — horizontal · gap 16px · center-vertical
//   Bell icon      24px #1A1210 (--text-primary)
//   Settings icon  24px #1A1210 (--text-primary)
//
// Component properties
//   greeting           text     "Good morning,"
//   name               text     "Alex 👋"
//   avatarInitials     text     auto-derived from name
//   onBellPress        fn
//   onSettingsPress    fn
// ─────────────────────────────────────────���───────────────────────────────────

/** Strip emoji and punctuation, return uppercase first letter for initials */
function deriveInitial(name: string): string {
  // Remove common emoji via unicode range, then trim
  const cleaned = name.replace(/\p{Emoji_Presentation}/gu, "").trim();
  return cleaned.charAt(0).toUpperCase() || "A";
}

export interface HomeHeaderProps {
  greeting?:        string;
  name?:            string;
  avatarInitials?:  string;
  onBellPress?:     () => void;
  onSettingsPress?: () => void;
}

export function HomeHeader({
  greeting        = "Good morning,",
  name            = "Alex 👋",
  avatarInitials,
  onBellPress,
  onSettingsPress,
}: HomeHeaderProps) {
  const initial = avatarInitials ?? deriveInitial(name);

  const [bellPressed, setBellPressed]     = useState(false);
  const [gearPressed, setGearPressed]     = useState(false);

  return (
    <div
      className="glass-header glass-shine"
      style={{
        // Frame
        position:       "relative",
        width:          "100%",
        height:         "56px",
        flexShrink:     0,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "0 16px",
        background:     "transparent",
        boxSizing:      "border-box",
      }}
    >

      {/* ── LEFT: Avatar + Greeting text ───────────────────────────────── */}
      <div
        style={{
          display:     "flex",
          alignItems:  "center",
          gap:         "10px",
        }}
      >

        {/* Avatar circle — 36px */}
        <div
          aria-label={`${name}'s avatar`}
          style={{
            width:           "36px",
            height:          "36px",
            flexShrink:      0,
            borderRadius:    "50%",
            background:      "var(--accent-tint)",       // #F5E8E4
            display:         "flex",
            alignItems:      "center",
            justifyContent:  "center",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              fontFamily:  "var(--font-sf-pro)",
              fontSize:    "15px",
              fontWeight:  "var(--font-weight-semibold)",
              lineHeight:  1,
              color:       "var(--accent-primary)",      // #B8472A
              userSelect:  "none",
            }}
          >
            {initial}
          </span>
        </div>

        {/* Text column — vertical · gap 2px */}
        <div
          style={{
            display:       "flex",
            flexDirection: "column",
            gap:           "2px",
          }}
        >
          {/* Greeting — 13px Regular #9C8880 */}
          <span
            style={{
              fontFamily:  "var(--font-sf-pro)",
              fontSize:    "13px",
              fontWeight:  "var(--font-weight-regular)",
              lineHeight:  "var(--text-lh-140)",
              color:       "var(--text-muted)",           // #9C8880
            }}
          >
            {greeting}
          </span>

          {/* Name — 17px Semibold #1A1210 */}
          <span
            style={{
              fontFamily:  "var(--font-sf-pro)",
              fontSize:    "17px",
              fontWeight:  "var(--font-weight-semibold)",
              lineHeight:  "var(--text-lh-140)",
              color:       "var(--text-primary)",         // #1A1210
            }}
          >
            {name}
          </span>
        </div>

      </div>

      {/* ── RIGHT: Action icons ─────────────────────────────────────────── */}
      <div
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        "16px",
        }}
      >

        {/* Bell icon — 24px */}
        <button
          type="button"
          aria-label="Notifications"
          onClick={onBellPress}
          onMouseDown={() => setBellPressed(true)}
          onMouseUp={() => setBellPressed(false)}
          onMouseLeave={() => setBellPressed(false)}
          onTouchStart={() => setBellPressed(true)}
          onTouchEnd={() => setBellPressed(false)}
          style={{
            display:         "flex",
            alignItems:      "center",
            justifyContent:  "center",
            width:           "36px",
            height:          "36px",
            borderRadius:    "50%",
            border:          "none",
            background:      bellPressed
              ? "var(--accent-tint)"
              : "transparent",
            cursor:          "pointer",
            transition:      "background 120ms ease-out, transform 120ms ease-out",
            transform:       bellPressed ? "scale(0.88)" : "scale(1)",
            padding:         0,
          }}
        >
          <Bell
            size={24}
            strokeWidth={1.75}
            aria-hidden="true"
            style={{ color: "var(--text-primary)" }}     // #1A1210
          />
        </button>

        {/* Settings / gear icon — 24px */}
        <button
          type="button"
          aria-label="Settings"
          onClick={onSettingsPress}
          onMouseDown={() => setGearPressed(true)}
          onMouseUp={() => setGearPressed(false)}
          onMouseLeave={() => setGearPressed(false)}
          onTouchStart={() => setGearPressed(true)}
          onTouchEnd={() => setGearPressed(false)}
          style={{
            display:         "flex",
            alignItems:      "center",
            justifyContent:  "center",
            width:           "36px",
            height:          "36px",
            borderRadius:    "50%",
            border:          "none",
            background:      gearPressed
              ? "var(--accent-tint)"
              : "transparent",
            cursor:          "pointer",
            transition:      "background 120ms ease-out, transform 120ms ease-out",
            transform:       gearPressed ? "scale(0.88)" : "scale(1)",
            padding:         0,
          }}
        >
          <Settings
            size={24}
            strokeWidth={1.75}
            aria-hidden="true"
            style={{ color: "var(--text-primary)" }}     // #1A1210
          />
        </button>

      </div>
    </div>
  );
}
