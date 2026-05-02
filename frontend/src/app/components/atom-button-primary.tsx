import React, { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Atom/Button/Primary
// Matches Figma component spec exactly:
//   • Three-layer stack: base gradient → shine overlay → label/icon
//   • Variants: Default | Pressed | Disabled
//   • Effect: Shadow/Button (--shadow-btn)
// ─────────────────────────────────────────────────────────────────────────────

export type ButtonVariant = "default" | "pressed" | "disabled";

export interface PrimaryButtonProps {
  /** Component property: Label text */
  label?: string;
  /** Component property: Show leading icon */
  showIcon?: boolean;
  /** Component property: Icon instance (any React node) */
  icon?: React.ReactNode;
  /** Externally force a variant state */
  state?: ButtonVariant;
  onClick?: () => void;
  /** Extra classes forwarded to the root element */
  className?: string;
  style?: React.CSSProperties;
  type?: "button" | "submit" | "reset";
}

export function PrimaryButton({
  label = "Add Task",
  showIcon = false,
  icon,
  state = "default",
  onClick,
  className = "",
  style,
  type = "button",
}: PrimaryButtonProps) {
  const [internalPressed, setInternalPressed] = useState(false);

  const isDisabled = state === "disabled";

  // If an external state is forced use it, otherwise derive from pointer events
  const resolvedState: ButtonVariant =
    state === "disabled"
      ? "disabled"
      : state === "pressed" || internalPressed
      ? "pressed"
      : "default";

  // ── Shadow ──────────────────────────────────────────────────────────────
  const boxShadow =
    resolvedState === "disabled"
      ? "none"
      : resolvedState === "pressed"
      ? "0px 2px 6px 0px rgba(184,71,42,0.18)" // reduced
      : "var(--shadow-btn)";

  // ── Scale ────────────────────────────────────────────────────────────────
  const transform =
    resolvedState === "pressed" ? "scale(0.97)" : "scale(1)";

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      onMouseDown={() => !isDisabled && setInternalPressed(true)}
      onMouseUp={() => setInternalPressed(false)}
      onMouseLeave={() => setInternalPressed(false)}
      onTouchStart={() => !isDisabled && setInternalPressed(true)}
      onTouchEnd={() => setInternalPressed(false)}
      className={`
        relative w-full overflow-hidden flex items-center justify-center
        transition-[transform,box-shadow] duration-100 ease-out
        select-none cursor-pointer disabled:cursor-not-allowed
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-offset-2 focus-visible:ring-accent-primary
        ${className}
      `}
      style={{
        ...style,
        height: "var(--btn-height, 52px)",
        borderRadius: "var(--radius-btn)", // 12px
        padding: "var(--btn-padding, 0 24px)",
        boxShadow,
        transform,
        // Disabled fills come through inline so they reliably override gradient
        background: isDisabled ? "var(--surface-border)" : "transparent",  // disabled: #EDE5DE
      }}
      aria-disabled={isDisabled}
    >
      {/* ── Layer 1 · Base gradient (only when not disabled) ─────────────── */}
      {!isDisabled && (
        <span
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(160deg, var(--gloss-start) 0%, var(--accent-primary) 45%, var(--accent-hover) 100%)",
            borderRadius: "inherit",
          }}
        />
      )}

      {/* ── Layer 2 · Shine overlay (top 50%, rounded top corners only) ──── */}
      {!isDisabled && (
        <span
          aria-hidden="true"
          className="absolute top-0 left-0 w-full pointer-events-none"
          style={{
            height: "50%",
            background:
              "linear-gradient(270deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.00) 100%)",
            borderRadius: "12px 12px 0 0",
          }}
        />
      )}

      {/* ── Layer 3 · Label + optional icon ─────────────────────────────── */}
      <span
        className="relative flex items-center justify-center gap-2 pointer-events-none"
      >
        {showIcon && icon && (
          <span
            className="flex items-center justify-center"
            style={{ color: isDisabled ? "var(--text-muted)" : "var(--text-on-accent)" }}
          >
            {icon}
          </span>
        )}

        <span
          style={{
            fontFamily: "var(--font-sf-pro)",
            fontSize: "var(--text-on-accent-size)",
            fontWeight: "var(--font-weight-semibold)",
            lineHeight: "var(--text-lh-140)",
            color: isDisabled ? "var(--text-muted)" : "var(--text-on-accent)",  // disabled: #9C8880
            letterSpacing: "0.01em",
          }}
        >
          {label}
        </span>
      </span>
    </button>
  );
}