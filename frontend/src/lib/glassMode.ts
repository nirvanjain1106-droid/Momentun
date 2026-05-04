const STORAGE_KEY = 'momentum_liquid_glass'
const BODY_CLASS = 'glass-mode'

// Check if device can handle backdrop-filter
function canUseBackdropFilter(): boolean {
  if (typeof CSS === 'undefined' || !CSS.supports) return true // Assume support in SSR/unknown
  return CSS.supports(
    'backdrop-filter', 'blur(1px)'
  ) || CSS.supports(
    '-webkit-backdrop-filter', 'blur(1px)'
  )
}

// Check if reduced motion is preferred
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches
}

export function isGlassEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function enableGlass(animate = true) {
  // Fallback: if backdrop-filter not supported
  // use solid semi-transparent background instead
  if (!canUseBackdropFilter()) {
    document.body.classList.add('glass-mode')
    document.body.classList.add('glass-no-blur')
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {}
    return
  }

  // Skip animation if user prefers reduced motion
  const shouldAnimate = animate && 
    !prefersReducedMotion()

  const body = document.body
  
  if (shouldAnimate) {
    body.classList.add('glass-entering')
    setTimeout(() => {
      body.classList.remove('glass-entering')
    }, 700)
  }
  
  body.classList.add(BODY_CLASS)
  
  try {
    localStorage.setItem(STORAGE_KEY, 'true')
  } catch {}
}

export function disableGlass(animate = true) {
  const body = document.body
  const shouldAnimate = animate && !prefersReducedMotion()
  
  if (shouldAnimate) {
    body.classList.add('glass-leaving')
    setTimeout(() => {
      body.classList.remove('glass-leaving')
    }, 500)
  }
  
  body.classList.remove(BODY_CLASS)
  body.classList.remove('glass-no-blur')
  
  try {
    localStorage.setItem(STORAGE_KEY, 'false')
  } catch {}
}

export function toggleGlass() {
  if (isGlassEnabled()) {
    disableGlass()
  } else {
    enableGlass()
  }
  return isGlassEnabled()
}

// Initialize on app load
export function initGlass() {
  if (isGlassEnabled()) {
    enableGlass(false) // No animation on initial load
  }
  
  // Sync with current theme
  let isDark = false
  try {
    isDark = localStorage.getItem('momentum_theme') !== 'light'
  } catch {}
  
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('dark-mode', isDark)
    document.body.classList.toggle('light-mode', !isDark)
  }
}
