# Sinema Ticketing System – Project Overview

## Summary

A cinema ticketing system that sells tickets from the web, a customer app and a box-office kiosk at the same time, with a staff app at the doors, all backed by one API. Wherever a seat is sold, every other screen shows it as taken immediately.

What makes it stand out as a portfolio project:

- Four clients, one API: the website (Next.js), the box-office kiosk (React + Vite), and a customer app and a staff app (Expo)
- A real technical problem: never selling the same seat twice (seat locking)
- Real-time updates: seat state reaches every screen instantly
- End-to-end flow: purchase, QR ticket, QR check at the door, admin reports

## Roles and clients

There are three roles: customer, staff and admin. The web, the customer app and the kiosk sell tickets; the staff app checks them at the doors; administration lives only on the web.

| Client | Used by | What it does |
| --- | --- | --- |
| Web – customer site | Customer (guest or signed in) | Picks a movie, showtime and seats, pays, gets a QR ticket, sees their tickets; no account needed |
| Web – `/admin` panel | Admin | Adds movies, halls, seat layouts and showtimes; sees sales and occupancy reports; manages staff accounts |
| Customer app (Expo) | Customer (signed in) | Same purchase flow as the web + my tickets; an account is required |
| Staff app (Expo) | Staff | Signs in and scans QR codes at the hall entrance, which marks tickets as used |
| Kiosk (React + Vite) | Staff + customer | A two-screen box office: staff sell step by step (showtime, seats, snacks, payment) on one screen; the second screen faces the customer, lets them tap their own seats during the seats step, then shows the basket, the total and a QR code for the tickets |

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
| Kiosk | React + Vite | A single-page app with no SEO needs; its two windows (`/` and `/display`) are linked by a BroadcastChannel. The website stays on Next.js for SEO |
| Data fetching | TanStack Query | Same in all three clients |
| Hosting | Docker Compose | PostgreSQL + API on our own server |

## Monorepo layout

Five apps and two shared packages live in one repo.

```
sinema/
├── apps/
│   ├── api/        Express + Prisma + Socket.io
│   ├── web/        Next.js (customer site + /admin)
│   ├── kiosk/      React + Vite box office (staff screen + customer screen)
│   ├── mobile/     Expo customer app
│   └── staff/      Expo staff app (QR scanning at the doors)
├── packages/
│   ├── shared/     shared types, Zod schemas, constants, translations
│   └── client/     code shared by the Expo apps and the kiosk: API client, session store, live seat updates
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

Note: from Expo SDK 52, Metro is configured for monorepos automatically, and pnpm's isolated installs work from SDK 54.

## Data model

Twelve tables: user, movie, hall layout, hall, seat, showtime, seat lock, order, ticket, product, order item and concession voucher.

| Table | Main fields | Notes |
| --- | --- | --- |
| User | id, email, passwordHash, name, role (CUSTOMER / STAFF / ADMIN) | Guest purchases have no user |
| Movie | id, title, description, durationMin, genre, posterUrl, tmdbId? | Fixed catalog from the seed |
| HallLayout | id, name, rows (JSON: row label + cells) | Seating plans: S standard, V VIP, W wheelchair, _ aisle |
| Hall | id, name, layoutId?, formats (TWO_D / THREE_D / IMAX / IMAX_3D) | A showtime's format must be one the hall supports |
| Seat | id, hallId, row (A, B…), number, column, type (STANDARD / VIP / WHEELCHAIR) | Built from the hall layout; column keeps aisles. Unique: hallId + row + number |
| Showtime | id, movieId, hallId, startsAt, price, format | price is the list price; discounts are applied automatically. No overlapping showtimes in the same hall |
| SeatLock | id, showtimeId, seatId, holderId, expiresAt | Unique: showtimeId + seatId; an expired lock is void |
| Order | id, holderId, userId?, amount, status (PENDING / PAID / FAILED), provider, providerRef?, idempotencyKey, contactEmail, accessToken, createdAt | Groups the tickets bought in one payment; idempotencyKey and accessToken are unique |
| Ticket | id, orderId, showtimeId, seatId, userId?, status (PAID / USED / CANCELLED), qrToken, channel (WEB / MOBILE / KIOSK), createdAt | Unique: showtimeId + seatId (among non-cancelled tickets) |
| Product | id, name (JSON by language), description?, category (COMBO / SNACK / DRINK / GLASSES), price, sortOrder, active | The concession stand; 3D glasses are sold only for 3D and IMAX 3D showtimes |
| OrderItem | id, orderId, productId, quantity, unitPrice | Price at the time of sale |
| ConcessionVoucher | id, orderItemId, qrToken, status (PAID / USED / CANCELLED), usedAt? | One per unit, each with its own QR code, so items can be collected separately or shared |

Money is stored as integer cents.

## Purchase flow and seat locking

A selected seat is locked for 7 minutes; if payment does not finish in that time, the lock is released.

1. The customer picks a movie and a showtime (grouped by day, then by format).
2. The API returns the showtime's sold and locked seats.
3. The customer picks seats; the API creates `SeatLock` rows in a transaction. The unique constraint rejects a second holder.
4. Socket.io broadcasts "seat locked" to every client.
5. Optional second step: snacks, drinks and combos; for 3D and IMAX 3D, 3D glasses come first with a "one per seat" shortcut. Third step: the basket (tickets, items, total) and payment. On the web the customer enters an email, as a guest if they like. When the (simulated) payment completes, a transaction creates the `Ticket` rows and a PAID `Order`, deletes the locks and issues QR tokens. Payment goes through a `PaymentProvider` interface; the first implementation is `FakeProvider`.
6. The API emails the QR codes and a link to `/orders/<accessToken>`, a page that shows them on any device without signing in. A failed email does not undo the sale.
7. If there is no payment within 7 minutes, the lock expires; the seat becomes free again and that is broadcast.
8. At the entrance, staff scan the QR code; a `PAID` ticket becomes `USED`, anything else is rejected.

Rules:

- Lock duration: 7 minutes
- A holder buys for one showtime at a time: locking seats in another showtime releases the rest at once
- A user or kiosk session can hold at most 10 seats at once
- QR tokens must be unguessable (random, signed)
- A QR code holds a link to its own page: `<WEB_URL>/t/<qrToken>` for tickets, `<WEB_URL>/c/<qrToken>` for concession items. Any phone camera opens it; scanners take the kind and the code out of the link
- The door only admits tickets and the stand only hands over items; each turns the other kind away without using it up, so the two never block each other
- The box office holds seats under the signed-in staff member; clearing a sale releases them, otherwise they expire like any other hold
- Box-office sales are paid in cash or by card at the counter; the email is optional and the tickets belong to no account
- The box office locks after 2 minutes without input, or from the header; the staff member's six-digit lock PIN unlocks it and the sale underneath is kept. The PIN is set once on the account (and changed from the header); at sign-in the API sends its salted digest so unlocking needs no round trip. After 3 wrong PINs the account password is asked instead, followed by an offer to set a new PIN. While locked, or with nobody signed in, the customer screen shows the counter as closed

## API and Socket.io events

REST endpoints live under `/api`; real-time events go to per-showtime rooms.

| Method | Path | What it does | Access |
| --- | --- | --- | --- |
| POST | /auth/register, /auth/login | Sign up and sign in, returns a JWT | Anyone |
| POST | /auth/guest | Start a guest session for a channel (WEB / MOBILE / KIOSK), returns a guest JWT | Anyone |
| GET | /movies | Movies now showing | Anyone |
| GET | /movies/:id | One movie | Anyone |
| GET | /movies/:id/showtimes | A movie's upcoming showtimes | Anyone |
| GET | /showtimes?from=&to= | Every movie's showtimes in a window of up to 8 days, with the seats left, for the box office | Anyone |
| GET | /showtimes/:id/seats | Seats + state (free / locked / sold) | Anyone |
| POST | /showtimes/:id/locks | Lock seats | Customer, guest, staff |
| DELETE | /locks/:id | Release a lock | Lock holder |
| POST | /checkout | Simulate payment, create tickets (idempotent per key) | Customer, guest |
| PUT | /me/pin | Set or change the caller's six-digit box-office lock PIN | Staff, admin |
| POST | /checkout/kiosk | Box-office sale: cash or card, optional email, channel KIOSK | Staff, admin |
| GET | /me/tickets | Tickets bought by this user or guest session | Customer, guest |
| GET | /orders/:accessToken | An order's tickets, for the emailed link | Link holder |
| GET | /tickets/:qrToken | One ticket, for the link in its QR code | Code holder |
| GET | /products?showtimeId= | Products on sale; glasses only for 3D showtimes | Anyone |
| GET | /me/concessions | Concession items bought by this user or guest | Customer, guest |
| GET | /concessions/:qrToken | One item, for the link in its QR code | Code holder |
| GET | /concessions/:qrToken/qr.png | An item's QR code as an image, for emails | Code holder |
| POST | /concessions/collect | Hand an item over at the stand | Staff |
| GET | /tickets/:qrToken/qr.png | A ticket's QR code as an image, for emails | Code holder |
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
| Ticket delivery | Email only, sent by the API through EmailJS's REST API (private key stays on the server); logged instead of sent when EmailJS is not configured |
| Accounts | Web: optional, guests buy with an email. Customer app: required. Staff app: staff and admin accounts only. Kiosk: staff sign in; customers need no account |
| Schedule | The seed plans each hall's day back to back for 7 days; a full schedule through 2030 comes later |
| Content language | Code and docs in English; the UI is English and Turkish, picked from the system language |
| Formats | 2D, 3D, IMAX and IMAX 3D; each hall lists the formats it supports and the same movie can run in several formats on one day |
| Discounts | Automatic flags from the start time, in cinema time: Wednesday is people's day (50% off); other weekdays before 17:00 get 15% off; at most one applies |
| Concessions | Products with their own QR codes per unit, collected at the stand; staff pick Door or Stand mode in the staff app |
| Hall layouts | Reusable seating plans (rows of S/W/_ cells) that halls are built from; the admin panel will create and assign them |
| Movie data | Now-playing movies from TMDB (titles, runtimes, genres, poster links) in `apps/api/prisma/movies.json`; descriptions are written by us; TMDB is credited in the apps |

## Roadmap

Every phase ends with something that runs and can be demoed.

1. **Foundation** – monorepo skeleton, PostgreSQL in Docker, Prisma schema, seed data
2. **API** – auth, movie/showtime endpoints, seat locking + checkout, QR verification, tests
3. **Web** – movie list → showtime → seat picker → payment → my tickets
4. **Mobile** – customer app (purchase flow) and staff app (QR scanning)
5. **Kiosk** – two-screen box office: staff screen to sell, customer-facing screen with seats, total and QR codes
6. **Admin** – movies, hall layouts and halls, showtimes, products, and the sales report; the seed covers demos until then
7. **Release (MVP)** – API + web live, demo accounts, README
8. **Polish** – screen recording, architecture diagram, a "how I solved double booking" write-up
