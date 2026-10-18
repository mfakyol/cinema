"use client";

import { SocketEvent } from "@sinema/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";

let socket: Socket | undefined;

function getSocket(): Socket {
  socket ??= io(API_URL, { transports: ["websocket", "polling"] });
  return socket;
}

/**
 * Keeps a showtime's seat map query fresh: any lock, release or sale broadcast by the API
 * refetches it. Returns whether the live connection is up.
 */
export function useLiveSeatMap(showtimeId: string, queryKey: readonly unknown[]): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();
    const join = () => {
      setConnected(true);
      s.emit(SocketEvent.JOIN_SHOWTIME, showtimeId);
      // Changes may have happened while disconnected.
      void queryClient.invalidateQueries({ queryKey });
    };
    const leave = () => setConnected(false);
    const refresh = () => void queryClient.invalidateQueries({ queryKey });

    if (s.connected) join();
    s.on("connect", join);
    s.on("disconnect", leave);
    s.on(SocketEvent.SEAT_LOCKED, refresh);
    s.on(SocketEvent.SEAT_RELEASED, refresh);
    s.on(SocketEvent.SEAT_SOLD, refresh);
    return () => {
      s.off("connect", join);
      s.off("disconnect", leave);
      s.off(SocketEvent.SEAT_LOCKED, refresh);
      s.off(SocketEvent.SEAT_RELEASED, refresh);
      s.off(SocketEvent.SEAT_SOLD, refresh);
    };
    // queryKey is rebuilt each render; showtimeId identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showtimeId, queryClient]);

  return connected;
}
