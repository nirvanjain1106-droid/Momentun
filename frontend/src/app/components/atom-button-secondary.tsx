import React, { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Atom/Button/Secondary
// Figma spec:
//   • Height 44px · radius 12px · padding 0 20px · hug content width
//   • Background: #F5E8E4 (--accent-tint) · no border · no shadow
//   • Label: 15px / Semibold / #B8472A
//   • Variants: Default | Pressed (bg #EDD5CE, scale 0.97)
// ─────────────────────────────────────────────────────────────────────────────

export type SecondaryButtonVariant = "default" | "pressed";

export interface SecondaryButtonProps {
  /** Component property: Label text */
  label?: string;
  /** Component property: Show leading icon */
  showIcon?: boolean;
  /** Component property: Icon instance (any React node) */
  icon?: React.ReactNode;
  /** Externally force a variant state */
  state?: SecondaryButtonVariant;
  onClick?: () => void;
  /** Extra classes forwarded to the root element */
  className?: string;
  type?: "button" | "submit" | "reset";
}

// Background per state
const BG: Record<SecondaryButtonVariant, string> = {
  default: "#F5E8E4", // --accent-tint
  pressed: "#EDD5CE",
};

export function SecondaryButton({
  label = "Explore Examples",
  showIcon = false,
  icon,
  state = "default",
  onClick,
  className = "",
  type = "button",
}: SecondaryButtonProps) {
  const [internalPressed, setInternalPressed] = useState(false);

  const resolvedState: SecondaryButtonVariant =
    state === "pressed" || internalPressed ? "pressed" : "default";

  const transform =
    resolvedState === "pressed" ? "scale(0.97)" : "scale(1)";

  return (
    <button
      type={type}
      onClick={onClick}
      onMouseDown={() => setInternalPressed(true)}
      onMouseUp={() => setInternalPressed(false)}
      onMouseLeave={() => setInternalPressed(false)}
      onTouchStart={() => setInternalPressed(true)}
      onTouchEnd={() => setInternalPressed(false)}
      className={`
        inline-flex items-center justify-center gap-2
        transition-[transform,background-color] duration-100 ease-out
        select-none cursor-pointer border-none outline-none
        focus-visible:ring-2 focus-visible:ring-offset-2
        focus-visible:ring-accent-primary
        ${className}
      `}
      style={{
        height: "44px",
        borderRadius: "var(--radius-btn)",   // 12px
        padding: "0 20px",
        background: BG[resolvedState],
        transform,
        boxShadow: "none",
      }}
    >
      {/* Optional leading icon */}
      {showIcon && icon && (
        <span
          className="flex items-center justify-center"
          style={{ color: "#B8472A" }}
        >
          {icon}
        </span>
      )}

      {/* Label — Text/Body metrics, Semibold weight, accent-primary color */}
      <span
        style={{
          fontFamily: "var(--font-sf-pro)",
          fontSize: "var(--text-body-size)",       // 15px
          fontWeight: "var(--font-weight-semibold)", // 600
          lineHeight: "var(--text-lh-140)",           // 1.4
          color: "#B8472A",                          // --accent-primary
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </span>
    </button>
  );
}
