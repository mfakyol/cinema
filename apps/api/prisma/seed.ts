import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { type LayoutRow, seatsFromLayout } from "@sinema/shared";
import { prisma } from "../src/db.js";
import { lockPinFor } from "../src/lib/lock-pin.js";
import { hashPassword } from "../src/lib/password.js";

type ShowFormat = "TWO_D" | "THREE_D" | "IMAX" | "IMAX_3D";

interface MovieSeed {
  title: string;
  description: string;
  durationMin: number;
  genre: string;
  posterUrl?: string | null;
  tmdbId?: number | null;
}

/** Builds layout rows from row letters and one cell string each, front to back. */
const plan = (rows: Record<string, string>): LayoutRow[] =>
  Object.entries(rows).map(([label, cells]) => ({ label, cells }));

/**
 * Seating plans (S standard, W wheelchair, _ aisle). Halls pick one; later the admin
 * panel creates more and assigns them.
 */
const LAYOUTS: Record<string, LayoutRow[]> = {
  "Classic, centre aisle": plan({
    A: "WSSSS_SSSSW",
    B: "SSSSS_SSSSS",
    C: "SSSSS_SSSSS",
    D: "SSSSS_SSSSS",
    E: "SSSSS_SSSSS",
    F: "SSSSS_SSSSS",
    G: "SSSSS_SSSSS",
    H: "SSSSS_SSSSS",
  }),
  Stadium: plan({
    A: "___SSSSSSSS___",
    B: "__SSSSSSSSSS__",
    C: "_SSSSSSSSSSSS_",
    D: "_SSSSSSSSSSSS_",
    E: "_SSSSSSSSSSSS_",
    F: "SSSSSSSSSSSSSS",
    G: "SSSSSSSSSSSSSS",
    H: "WSSSSS__SSSSSW",
  }),
  Studio: plan({
    A: "_SSS_SSS_",
    B: "SSSS_SSSS",
    C: "SSSS_SSSS",
    D: "SSSS_SSSS",
    E: "SSSS_SSSS",
    F: "SSSS_SSSS",
  }),
  "IMAX, two aisles": plan({
    A: "WW_SSSSSSSSSS_WW",
    B: "SSS_SSSSSSSSSS_SSS",
    C: "SSS_SSSSSSSSSS_SSS",
    D: "SSS_SSSSSSSSSS_SSS",
    E: "SSS_SSSSSSSSSS_SSS",
    F: "SSS_SSSSSSSSSS_SSS",
    G: "SSS_SSSSSSSSSS_SSS",
    H: "SSS_SSSSSSSSSS_SSS",
    I: "SSS_SSSSSSSSSS_SSS",
    J: "SSS_SSSSSSSSSS_SSS",
  }),
};

/** Each hall shows the formats its screen and projector support, on one of the layouts. */
const HALLS: { name: string; layout: keyof typeof LAYOUTS; formats: ShowFormat[] }[] = [
  { name: "Hall 1", layout: "Classic, centre aisle", formats: ["TWO_D", "THREE_D"] },
  { name: "Hall 2", layout: "Stadium", formats: ["TWO_D"] },
  { name: "Hall 3", layout: "Studio", formats: ["TWO_D", "THREE_D"] },
  { name: "IMAX", layout: "IMAX, two aisles", formats: ["IMAX", "IMAX_3D"] },
];

/** Ticket price in cents by format. */
const PRICES: Record<ShowFormat, number> = { TWO_D: 25000, THREE_D: 30000, IMAX: 35000, IMAX_3D: 40000 };

/** The most popular movies also run in 3D and IMAX; the rest in 2D only. */
const PREMIUM_MOVIES = 3;

/** Showtimes start from this hour; the last one must start by LAST_START. */
const FIRST_START = { hour: 11, minute: 0 };
const LAST_START_HOUR = 23;
/** Cleaning and ads between two showings in one hall, and start times round up to this step. */
const TURNAROUND_MIN = 25;
const START_STEP_MIN = 15;

/** Demo accounts; the README lists them. */
const DEMO_PASSWORD = "demo1234";
/** Box-office lock PIN of the demo staff and admin accounts. */
const DEMO_PIN = "123456";

const DEMO_MOVIES: MovieSeed[] = [
  {
    title: "Beyond the Stars",
    description: "A crew of explorers travels through a wormhole to find humanity a new home.",
    durationMin: 169,
    genre: "Sci-Fi",
  },
  {
    title: "The Lost City",
    description: "A young archaeologist follows the trail of a city that appears on no map.",
    durationMin: 118,
    genre: "Adventure",
  },
  {
    title: "Final Curtain",
    description: "On the eve of retirement, a stage actor walks out for one last performance.",
    durationMin: 104,
    genre: "Drama",
  },
];

/** Movies from the TMDB import (`pnpm tmdb:import`), so seeding needs no network or API key. */
const MOVIES_FILE = new URL("./movies.json", import.meta.url);
const MOVIES: MovieSeed[] = existsSync(MOVIES_FILE)
  ? JSON.parse(readFileSync(MOVIES_FILE, "utf-8"))
  : DEMO_MOVIES;

/**
 * The concession stand. Names are kept in a data file next to this script because they are
 * shown to customers in each supported language.
 */
const PRODUCTS: {
  category: "COMBO" | "SNACK" | "DRINK" | "GLASSES";
  price: number;
  name: Record<string, string>;
  description?: Record<string, string>;
}[] = JSON.parse(readFileSync(new URL("./products.json", import.meta.url), "utf-8"));

/** A week ahead, so every weekday and its discount (Wednesday, weekday daytime) is on sale. */
const DAYS = 7;

const roundUp = (minutes: number) => Math.ceil(minutes / START_STEP_MIN) * START_STEP_MIN;

/**
 * One day's programme for a hall: movies back to back with a turnaround between them, cycling
 * through the movies the hall's formats suit. Returns start minutes after midnight.
 */
function planHallDay(
  formats: ShowFormat[],
  movies: { id: string; durationMin: number; premium: boolean }[],
  offset: number,
) {
  const premiumFormats = formats.filter((format) => format !== "TWO_D");
  // An IMAX hall only shows premium movies; a 3D-capable hall alternates 3D and 2D.
  const candidates = formats.includes("TWO_D") ? movies : movies.filter((movie) => movie.premium);
  const plan: { movieId: string; format: ShowFormat; startMin: number }[] = [];
  let startMin = FIRST_START.hour * 60 + FIRST_START.minute;
  for (let i = 0; startMin <= LAST_START_HOUR * 60 && candidates.length > 0; i++) {
    const movie = candidates[(i + offset) % candidates.length]!;
    const premiumSlot = movie.premium && premiumFormats.length > 0 && (i % 2 === 0 || !formats.includes("TWO_D"));
    const format = premiumSlot ? premiumFormats[i % premiumFormats.length]! : "TWO_D";
    plan.push({ movieId: movie.id, format, startMin });
    startMin = roundUp(startMin + movie.durationMin + TURNAROUND_MIN);
  }
  return plan;
}

async function main() {
  // Reset in dependency order so the seed can be re-run.
  await prisma.concessionVoucher.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.product.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.order.deleteMany();
  await prisma.seatLock.deleteMany();
  await prisma.showtime.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.hall.deleteMany();
  await prisma.hallLayout.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const pin = () => {
    const { salt, digest } = lockPinFor(DEMO_PIN);
    return { lockPinSalt: salt, lockPinDigest: digest };
  };
  await prisma.user.createMany({
    data: [
      { email: "admin@sinema.test", name: "Admin", role: "ADMIN", passwordHash, ...pin() },
      { email: "staff@sinema.test", name: "Staff", role: "STAFF", passwordHash, ...pin() },
      { email: "customer@sinema.test", name: "Customer", role: "CUSTOMER", passwordHash },
    ],
  });

  const layoutIds = new Map<string, string>();
  for (const [name, rows] of Object.entries(LAYOUTS)) {
    const layout = await prisma.hallLayout.create({ data: { name, rows: rows as unknown as object } });
    layoutIds.set(name, layout.id);
  }

  const halls = [];
  for (const hall of HALLS) {
    halls.push(
      await prisma.hall.create({
        data: {
          name: hall.name,
          formats: hall.formats,
          layoutId: layoutIds.get(hall.layout)!,
          seats: { create: seatsFromLayout(LAYOUTS[hall.layout]!) },
        },
      }),
    );
  }

  const movies = await Promise.all(MOVIES.map((data) => prisma.movie.create({ data })));

  // Every hall runs its own back-to-back programme, so showtimes in a hall never overlap.
  // Halls start at different points in the movie list, so one movie plays in several halls.
  const scheduled = movies.map((movie, index) => ({
    id: movie.id,
    durationMin: movie.durationMin,
    premium: index < PREMIUM_MOVIES,
  }));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const showtimes = [];
  for (let day = 0; day < DAYS; day++) {
    for (const [hallIndex, hall] of halls.entries()) {
      for (const slot of planHallDay(HALLS[hallIndex]!.formats, scheduled, hallIndex + day)) {
        const startsAt = new Date(today);
        startsAt.setDate(today.getDate() + day);
        startsAt.setMinutes(slot.startMin);
        showtimes.push({ movieId: slot.movieId, hallId: hall.id, startsAt, price: PRICES[slot.format], format: slot.format });
      }
    }
  }
  await prisma.showtime.createMany({ data: showtimes });

  await prisma.product.createMany({
    data: PRODUCTS.map((product, sortOrder) => ({ ...product, sortOrder })),
  });

  console.log(
    `Seeded 3 users, ${Object.keys(LAYOUTS).length} layouts, ${halls.length} halls, ` +
      `${movies.length} movies, ${showtimes.length} showtimes, ${PRODUCTS.length} products.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
