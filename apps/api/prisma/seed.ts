import "dotenv/config";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/lib/password.js";

const ROWS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const SEATS_PER_ROW = 10;
/** The back row is VIP. */
const VIP_ROWS = new Set(["H"]);

/** Demo accounts; the README lists them. */
const DEMO_PASSWORD = "demo1234";

const MOVIES = [
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

/** Daily start times for each movie, in local hours. */
const START_HOURS = [13, 16, 19, 22];
const DAYS = 3;
/** Ticket price in cents. */
const PRICE = 25000;

async function main() {
  // Reset in dependency order so the seed can be re-run.
  await prisma.ticket.deleteMany();
  await prisma.order.deleteMany();
  await prisma.seatLock.deleteMany();
  await prisma.showtime.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.hall.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await prisma.user.createMany({
    data: [
      { email: "admin@sinema.test", name: "Admin", role: "ADMIN", passwordHash },
      { email: "staff@sinema.test", name: "Staff", role: "STAFF", passwordHash },
      { email: "customer@sinema.test", name: "Customer", role: "CUSTOMER", passwordHash },
    ],
  });

  const halls = await Promise.all(
    ["Hall 1", "Hall 2"].map((name) =>
      prisma.hall.create({
        data: {
          name,
          seats: {
            create: ROWS.flatMap((row) =>
              Array.from({ length: SEATS_PER_ROW }, (_, i) => ({
                row,
                number: i + 1,
                type: VIP_ROWS.has(row) ? ("VIP" as const) : ("STANDARD" as const),
              })),
            ),
          },
        },
      }),
    ),
  );

  const movies = await Promise.all(MOVIES.map((data) => prisma.movie.create({ data })));

  // Give each movie its own hall slot so showtimes in a hall never overlap:
  // the longest movie runs under three hours and starts are three hours apart.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const showtimes = [];
  for (let day = 0; day < DAYS; day++) {
    for (const [i, movie] of movies.entries()) {
      const hall = halls[i % halls.length];
      const hours = i < halls.length ? START_HOURS.slice(0, 2) : START_HOURS.slice(2);
      for (const hour of hours) {
        const startsAt = new Date(today);
        startsAt.setDate(today.getDate() + day);
        startsAt.setHours(hour);
        showtimes.push({ movieId: movie.id, hallId: hall.id, startsAt, price: PRICE });
      }
    }
  }
  await prisma.showtime.createMany({ data: showtimes });

  console.log(
    `Seeded 3 users, ${halls.length} halls (${ROWS.length * SEATS_PER_ROW} seats each), ` +
      `${movies.length} movies, ${showtimes.length} showtimes.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
