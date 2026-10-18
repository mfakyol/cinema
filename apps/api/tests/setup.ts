import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/db.js";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "ConcessionVoucher", "OrderItem", "Product", "Ticket", "Order", "SeatLock", "Showtime", "Seat", "Hall", "HallLayout", "Movie", "User" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
