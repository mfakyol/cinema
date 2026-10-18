import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/db.js";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Ticket", "Order", "SeatLock", "Showtime", "Seat", "Hall", "Movie", "User" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
