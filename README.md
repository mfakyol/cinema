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
pnpm dev:web
```

The API serves `http://localhost:4000/api/health` and the website opens at `http://localhost:3000`.

The website picks English or Turkish from the browser's language and light or dark from the operating system theme. Set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` when the API is not on `http://localhost:4000`.

## Ticket emails

After checkout the API emails the QR codes and a link to the order page through [EmailJS](https://www.emailjs.com). Without EmailJS settings the email is written to the API log instead, so everything works locally.

To send real emails:

1. Create an EmailJS service and an email template.
2. In the template, set the recipient to `{{to_email}}` and the subject to `{{subject}}`, and use these variables in the body: `{{greeting}}`, `{{details}}`, `{{{tickets_html}}}` (triple braces, it contains the QR images), `{{order_link}}`, `{{show_tickets}}` and `{{link_hint}}`.
3. Under Account → Security, turn on "Allow EmailJS API for non-browser applications".
4. Fill `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY` and `EMAILJS_PRIVATE_KEY` in `apps/api/.env`, and set `API_URL` and `WEB_URL` to addresses the recipient can open.

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
