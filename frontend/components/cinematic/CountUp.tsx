"use client";

/**
 * CountUp — deterministic count-up number for stat reveals.
 *
 * Uses a rAF ease-out ramp so it always animates identically on refresh. Pass
 * `start` to gate when the ramp begins (scenes stagger several of these).
 */

import { useEffect, useState } from "react";

interface CountUpProps {
  to: number;
  start?: boolean;
  duration?: number;
  delay?: number;
}

export default function CountUp({
  to,
  start = true,
  duration = 1.4,
  delay = 0,
}: CountUpProps) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) return;
    let raf = 0;
    const begin = performance.now() + delay * 1000;
    const tick = (now: number) => {
      const p = Math.min(Math.max((now - begin) / (duration * 1000), 0), 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, to, duration, delay]);

  return <>{value.toLocaleString()}</>;
}
