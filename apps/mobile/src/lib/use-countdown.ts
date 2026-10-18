import { useEffect, useState } from "react";

/** Milliseconds left until `deadline`, updated every second; null without a deadline. */
export function useCountdown(deadline: string | undefined, onExpire: () => void): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  const remaining = deadline ? Math.max(0, new Date(deadline).getTime() - now) : null;

  useEffect(() => {
    if (remaining === 0) onExpire();
    // Fire once when the countdown reaches zero, not on every new callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining === 0]);

  return remaining;
}

export function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, "0")}`;
}
