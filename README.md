# Sinema

A cinema ticketing system that sells tickets from web, mobile and a kiosk through one API. Design and roadmap: [PROJECT.md](PROJECT.md).

## Requirements

- Node.js 22+
- pnpm (ships with `corepack enable`)
- Docker (for PostgreSQL)

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

The API serves `http://localhost:4000/api/health`.

## Tests

The API tests run against a separate `sinema_test` database in the same PostgreSQL container, created and migrated on first run:

```bash
pnpm db:up
pnpm test
```

## Demo accounts

The seed creates three accounts, all with the password `demo1234`:

| Email | Role |
| --- | --- |
| admin@sinema.test | Admin |
| staff@sinema.test | Staff |
| customer@sinema.test | Customer |
