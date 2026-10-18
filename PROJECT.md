# Sinema Ticketing System – Project Overview

## Summary

A cinema ticketing system that sells tickets from web, mobile and a kiosk at the same time, all backed by one API. Wherever a seat is sold, every other screen shows it as taken immediately.

What makes it stand out as a portfolio project:

- Three clients, one API: web, mobile (React Native) and kiosk (Electron)
- A real technical problem: never selling the same seat twice (seat locking)
- Real-time updates: seat state reaches every screen instantly
- End-to-end flow: purchase, QR ticket, QR check at the door, admin reports

## Roles and clients

There are three roles: customer, staff and admin. All three clients can sell tickets; administration lives only on the web.

| Client | Used by | What it does |
| --- | --- | --- |
| Web – customer site | Customer | Picks a movie, showtime and seats, pays, gets a QR ticket, sees their tickets |
| Web – `/admin` panel | Admin | Adds movies, halls, seat layouts and showtimes; sees sales and occupancy reports; manages staff accounts |
| Mobile (Expo) | Customer | Same purchase flow as the web + my tickets |
| Mobile (Expo) – staff mode | Staff | Scans QR codes at the hall entrance and marks tickets as used |
| Kiosk (Electron) | Customer (guest) | Buys a ticket quickly on a lobby touchscreen without signing in |

## Stack

TypeScript everywhere; the backend is Node + Express + PostgreSQL.

| Part | Choice | Why |
| --- | --- | --- |
| Language | TypeScript | Types shared across all apps |
| Repo | pnpm workspaces (monorepo) | One repo, a shared `shared` package |
| Backend | Node + Express | Familiar structure |
| Database | PostgreSQL + Prisma | Relational data; transactions and unique constraints keep seats safe |
| Real-time | Socket.io | Seat state on every screen instantly |
| Validation | Zod | Same schemas in the API and the forms |
| Auth | JWT | Same approach for web, mobile and kiosk |
| Web | Next.js (App Router) | Customer site + admin panel |
| Mobile | Expo + Expo Router | File-based routing, similar to Next.js |
| Kiosk | Electron + React (Vite) | Touchscreen desktop app |
| Data fetching | TanStack Query | Same in all three clients |
| Hosting | Docker Compose | PostgreSQL + API on our own server |

## Monorepo layout

Four apps and one shared package live in one repo.

```
sinema/
├── apps/
│   ├── api/        Express + Prisma + Socket.io
│   ├── web/        Next.js (customer site + /admin)
│   ├── mobile/     Expo (React Native)
│   └── kiosk/      Electron + React (Vite)
├── packages/
│   └── shared/     shared types, Zod schemas, constants
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

Note: for Expo to see `packages/shared`, `metro.config.js` needs the monorepo settings (watchFolders, nodeModulesPaths) from the start.

## Data model

Eight tables: user, movie, hall, seat, showtime, seat lock, order and ticket.

| Table | Main fields | Notes |
| --- | --- | --- |
| User | id, email, passwordHash, name, role (CUSTOMER / STAFF / ADMIN) | Kiosk purchases can have no user |
| Movie | id, title, description, durationMin, genre, posterUrl, tmdbId? | Fixed catalog from the seed |
| Hall | id, name | |
| Seat | id, hallId, row (A, B…), number, type (STANDARD / VIP) | Unique: hallId + row + number |
| Showtime | id, movieId, hallId, startsAt, price | No overlapping showtimes in the same hall |
| SeatLock | id, showtimeId, seatId, holderId, expiresAt | Unique: showtimeId + seatId; an expired lock is void |
| Order | id, holderId, userId?, amount, status (PENDING / PAID / FAILED), provider, providerRef?, idempotencyKey, createdAt | Groups the tickets bought in one payment; idempotencyKey is unique |
| Ticket | id, orderId, showtimeId, seatId, userId?, status (PAID / USED / CANCELLED), qrToken, channel (WEB / MOBILE / KIOSK), createdAt | Unique: showtimeId + seatId (among non-cancelled tickets) |

Money is stored as integer cents.

## Purchase flow and seat locking

A selected seat is locked for 7 minutes; if payment does not finish in that time, the lock is released.

1. The customer picks a movie and a showtime.
2. The API returns the showtime's sold and locked seats.
3. The customer picks seats; the API creates `SeatLock` rows in a transaction. The unique constraint rejects a second holder.
4. Socket.io broadcasts "seat locked" to every client.
5. When the (simulated) payment completes, a transaction creates the `Ticket` rows and a PAID `Order`, deletes the locks and issues QR tokens. Payment goes through a `PaymentProvider` interface; the first implementation is `FakeProvider`.
6. If there is no payment within 7 minutes, the lock expires; the seat becomes free again and that is broadcast.
7. At the entrance, staff scan the QR code; a `PAID` ticket becomes `USED`, anything else is rejected.

Rules:

- Lock duration: 7 minutes
- A user or kiosk session can hold at most 10 seats at once
- QR tokens must be unguessable (random, signed)
- The kiosk resets its session and releases its locks after 60 seconds without a touch

## API and Socket.io events

REST endpoints live under `/api`; real-time events go to per-showtime rooms.

| Method | Path | What it does | Access |
| --- | --- | --- | --- |
| POST | /auth/register, /auth/login | Sign up and sign in, returns a JWT | Anyone |
| GET | /movies | Movies now showing | Anyone |
| GET | /movies/:id/showtimes | A movie's showtimes | Anyone |
| GET | /showtimes/:id/seats | Seats + state (free / locked / sold) | Anyone |
| POST | /showtimes/:id/locks | Lock seats | Customer, kiosk |
| DELETE | /locks/:id | Release a lock | Lock holder |
| POST | /checkout | Simulate payment, create tickets | Lock holder |
| GET | /me/tickets | My tickets | Customer |
| POST | /tickets/verify | Check a QR code, mark the ticket used | Staff |
| CRUD | /admin/movies, /admin/halls, /admin/showtimes | Administration | Admin |
| GET | /admin/reports/sales | Sales and occupancy report | Admin |

Socket.io:

- A client joins a showtime room with `showtime:join`
- The server broadcasts `seat:locked`, `seat:released` and `seat:sold` to that room

## Decisions

These are the defaults; changes are recorded here.

| Topic | Decision |
| --- | --- |
| Project | Cinema ticketing system (web + mobile + kiosk) |
| Database | PostgreSQL + Prisma (instead of MongoDB) |
| Repo | pnpm monorepo, no Turborepo for now |
| Seat lock | 7 minutes |
| Payment | Simulated first (`FakeProvider`) behind a `PaymentProvider` interface; a real provider's test mode (iyzico or Stripe) after the MVP |
| Real-time | Yes, Socket.io |
| Kiosk ticket | QR on screen first, printer later |
| Accounts | Sign-up on web and mobile, guest on the kiosk |
| Movie data | Fixed catalog in the seed; the same daily showtime schedule repeats. The seed covers 3 days for now; a full schedule through 2030 comes later |
| Content language | English throughout: UI, seed data, docs |

## Roadmap

Every phase ends with something that runs and can be demoed.

1. **Foundation** – monorepo skeleton, PostgreSQL in Docker, Prisma schema, seed data
2. **API** – auth, movie/showtime endpoints, seat locking + checkout, QR verification, tests
3. **Web** – movie list → showtime → seat picker → payment → my tickets
4. **Admin** – movie, hall and showtime management and the sales report
5. **Release (MVP)** – API + web live, demo accounts, README
6. **Mobile** – customer flow + staff QR scanning
7. **Kiosk** – touch flow, idle timeout, QR on screen
8. **Polish** – screen recording, architecture diagram, a "how I solved double booking" write-up
