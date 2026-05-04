export function playGlassEnableAnimation() {
  if (typeof document === 'undefined') return
  
  const shimmer = document.createElement('div')
  shimmer.style.cssText = `
    position: fixed;
    inset: 0;
    background: linear-gradient(
      135deg,
      rgba(255,255,255,0) 0%,
      rgba(255,255,255,0.06) 50%,
      rgba(255,255,255,0) 100%
    );
    background-size: 200% 200%;
    animation: glassShimmer 600ms ease-out forwards;
    pointer-events: none;
    z-index: 9999;
  `
  document.body.appendChild(shimmer)
  setTimeout(() => shimmer.remove(), 700)
}
