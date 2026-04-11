import { useEffect, useRef } from 'react'

/**
 * Tracks whether the Shift key is currently held.
 * Returns a ref whose `.current` is updated synchronously on keydown/keyup/blur.
 * Using a ref (not state) avoids re-renders on every key event.
 */
export function useShiftKeyTracker(): React.MutableRefObject<boolean> {
  const shiftRef = useRef(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) shiftRef.current = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.shiftKey) shiftRef.current = false
    }
    const onBlur = () => {
      shiftRef.current = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return shiftRef
}
