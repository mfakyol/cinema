import { SocketEvent } from "@sinema/shared";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

const sockets = new Map<string, Socket>();

function socketFor(baseUrl: string): Socket {
  let socket = sockets.get(baseUrl);
  if (!socket) {
    // WebSocket only: React Native has no long-polling fallback worth using.
    socket = io(baseUrl, { transports: ["websocket"] });
    sockets.set(baseUrl, socket);
  }
  return socket;
}

/**
 * Keeps a showtime's seat map query fresh: any lock, release or sale broadcast by the API
 * refetches it. Returns whether the live connection is up.
 */
export function useLiveSeatMap(baseUrl: string, showtimeId: string, queryKey: QueryKey): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = socketFor(baseUrl);
    const refresh = () => void queryClient.invalidateQueries({ queryKey });
    const join = () => {
      setConnected(true);
      socket.emit(SocketEvent.JOIN_SHOWTIME, showtimeId);
      // Changes may have happened while disconnected.
      refresh();
    };
    const leave = () => setConnected(false);

    if (socket.connected) join();
    socket.on("connect", join);
    socket.on("disconnect", leave);
    socket.on(SocketEvent.SEAT_LOCKED, refresh);
    socket.on(SocketEvent.SEAT_RELEASED, refresh);
    socket.on(SocketEvent.SEAT_SOLD, refresh);
    return () => {
      socket.off("connect", join);
      socket.off("disconnect", leave);
      socket.off(SocketEvent.SEAT_LOCKED, refresh);
      socket.off(SocketEvent.SEAT_RELEASED, refresh);
      socket.off(SocketEvent.SEAT_SOLD, refresh);
    };
    // queryKey is rebuilt each render; showtimeId identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, showtimeId, queryClient]);

  return connected;
}
