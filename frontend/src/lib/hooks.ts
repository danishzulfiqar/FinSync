import { useEffect, useState } from "react";

/** Becomes true only after `active` has stayed true for `delayMs`. Resets immediately when inactive. */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    if (!active) {
      setFlag(false);
      return;
    }
    const id = window.setTimeout(() => setFlag(true), delayMs);
    return () => window.clearTimeout(id);
  }, [active, delayMs]);
  return flag;
}
