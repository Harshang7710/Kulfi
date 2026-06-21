'use client';

import { useEffect, useRef, useState } from 'react';

/** Splits "₹1234.50" into { prefix: '₹', number: 1234.5, decimals: 2, suffix: '' }. */
function parseValue(value: string | number): { prefix: string; number: number; decimals: number; suffix: string } {
  if (typeof value === 'number') return { prefix: '', number: value, decimals: 0, suffix: '' };
  const match = value.match(/^([^\d-]*)(-?[\d.]+)(.*)$/);
  if (!match) return { prefix: '', number: 0, decimals: 0, suffix: value };
  const [, prefix, numStr, suffix] = match;
  const decimals = numStr.includes('.') ? numStr.split('.')[1].length : 0;
  return { prefix, number: Number(numStr), decimals, suffix };
}

/** Animates a stat value counting up from its previous value to the next on every change. */
export default function CountUp({ value }: { value: string | number }) {
  const { prefix, number, decimals, suffix } = parseValue(value);
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    const start = mountedRef.current ? prevRef.current : 0;
    const end = number;
    prevRef.current = number;
    mountedRef.current = true;

    if (start === end) {
      setDisplay(end);
      return;
    }
    const duration = 700;
    const startTime = performance.now();
    let frame: number;
    function tick(now: number) {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (end - start) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [number]);

  return (
    <>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </>
  );
}
