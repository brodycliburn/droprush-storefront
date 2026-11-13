# DROPRUSH

A storefront with real accounts, a synced want-to-buy list, a personalized
For you feed, and Stripe Checkout in test or live mode.

## Run locally

```sh
bun install
cp .env.example .env
bun run dev:api      # checkout API on http://127.0.0.1:8788
bun run dev          # Vite storefront on http://localhost:3000
```

Open the storefront URL printed by Vite. The frontend proxies `/api` to the API.
Without Stripe keys, checkout records a clearly labelled test order.

## Checks

```sh
bun run build
bun run check:deploy
bun run db:export
```

`check:deploy` validates the environment and prints the exact Stripe webhook
URL. `db:export` writes a reviewable import file for the hosted database.

## Supplier handoff

Checkout asks for a shipping address and saves it with the order. Once Stripe
confirms payment, the order is marked `ready` for supplier handoff.

Set `ADMIN_TOKEN` to a long random value on the API, then export paid orders:

```sh
ADMIN_TOKEN=<same value> bun run supplier:export
# writes .data/supplier-orders-YYYY-MM-DD.csv

bun run supplier:export -- --supplier "Supplier name" --status all
bun run supplier:mark-sent -- DR-XXXX-XXXX
```

The export includes only paid orders. By default it includes `ready` orders;
use `--status sent` or `--status all` to include orders already handed off.
Pass `--supplier` when a supplier should receive only their own line items.
The CSV has the recipient, address and every ordered line for the supplier.

Without the CLI, the same actions are available at:

```text
GET  /api/supplier/orders
GET  /api/supplier/orders.csv?status=ready&supplier=...
POST /api/supplier/orders/:ref/sent
Authorization: Bearer $ADMIN_TOKEN
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the HTTPS API, Turso hosted database,
SQLite data migration, environment variables, and Stripe webhook setup.

The static site in `dist/` does not include the API. A real checkout needs the
Node service in `server/index.mjs` on an HTTPS host.
