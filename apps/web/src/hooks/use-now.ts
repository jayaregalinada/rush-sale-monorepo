import { useEffect, useState } from 'react';

const TICK_MS = 1000;

/** Current wall-clock time in epoch milliseconds, re-rendering the caller once a second. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const handle = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);

    return () => {
      clearInterval(handle);
    };
  }, []);

  return now;
}
