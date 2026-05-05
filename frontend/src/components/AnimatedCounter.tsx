import { useEffect, useRef, useState } from "react";

export function AnimatedCounter({
  value,
  suffix = "",
  duration = 900,
}: {
  value: number;
  suffix?: string;
  duration?: number;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();

    function animate(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * easedProgress));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    }

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [duration, value]);

  return (
    <>
      {displayValue}
      {suffix}
    </>
  );
}
