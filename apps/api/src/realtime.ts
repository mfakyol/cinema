import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { SocketEvent } from "@sinema/shared";

let io: Server | undefined;

const room = (showtimeId: string) => `showtime:${showtimeId}`;

export function attachRealtime(server: HttpServer): Server {
  io = new Server(server, { cors: { origin: true } });
  io.on("connection", (socket) => {
    socket.on(SocketEvent.JOIN_SHOWTIME, (showtimeId: unknown) => {
      if (typeof showtimeId === "string") void socket.join(room(showtimeId));
    });
  });
  return io;
}

/** Broadcasts to everyone watching a showtime's seat map. A no-op until attached (e.g. in tests). */
export function emitToShowtime(showtimeId: string, event: string, payload: unknown) {
  io?.to(room(showtimeId)).emit(event, payload);
}
