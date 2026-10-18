"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type SeatMap } from "@/lib/api";
import { useLiveSeatMap } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useCountdown } from "./use-countdown";

/**
 * A showtime's live seat map and the caller's held seats, with the time left on the hold.
 * Shared by the seats, snacks and payment steps so all three count down the same hold.
 */
export function useSeatHold(showtimeId: string) {
  const session = useSession();
  const queryClient = useQueryClient();
  // Keyed by session so a new guest session or a sign-in refetches with the right "mine" flags.
  const queryKey = ["seats", showtimeId, session?.token ?? "anonymous"] as const;
  const seatMap = useQuery({ queryKey, queryFn: () => apiFetch<SeatMap>(`/showtimes/${showtimeId}/seats`) });
  const live = useLiveSeatMap(showtimeId, queryKey);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["seats", showtimeId] });

  const mine = seatMap.data?.seats.filter((seat) => seat.lockId) ?? [];
  const firstExpiry = mine.map((seat) => seat.lockExpiresAt!).sort()[0];
  const remaining = useCountdown(firstExpiry, () => void refresh());

  return { seatMap, mine, remaining, live, refresh };
}
