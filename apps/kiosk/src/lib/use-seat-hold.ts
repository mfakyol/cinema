import { useLiveSeatMap } from "@sinema/client";
import type { SeatMap } from "@sinema/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, API_URL } from "./api";
import { useSession } from "./session";
import { useCountdown } from "./use-countdown";

/**
 * A showtime's live seat map and the seats held by the signed-in staff member, with the time
 * left on the hold. Both windows use it, so the customer sees the same seats as "theirs".
 */
export function useSeatHold(showtimeId: string) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const queryKey = ["seats", showtimeId, session?.user.id ?? "anonymous"] as const;
  const seatMap = useQuery({ queryKey, queryFn: () => api.fetch<SeatMap>(`/showtimes/${showtimeId}/seats`) });
  const live = useLiveSeatMap(API_URL, showtimeId, queryKey);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["seats", showtimeId] });

  const mine = seatMap.data?.seats.filter((seat) => seat.lockId) ?? [];
  const firstExpiry = mine.map((seat) => seat.lockExpiresAt!).sort()[0];
  const remaining = useCountdown(firstExpiry, () => void refresh());

  return { seatMap, mine, remaining, live, refresh };
}
