import { useState, useEffect } from 'react'
import { 
  isGlassEnabled, 
  enableGlass, 
  disableGlass,
  initGlass
} from './glassMode'

export function useGlassMode() {
  const [glassEnabled, setGlassEnabled] = useState(isGlassEnabled)
  
  useEffect(() => {
    initGlass()
  }, [])
  
  const setGlass = (enabled: boolean) => {
    if (enabled) {
      enableGlass()
    } else {
      disableGlass()
    }
    setGlassEnabled(enabled)
  }
  
  return { glassEnabled, setGlass }
}
