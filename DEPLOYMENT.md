# DROPRUSH deployment runbook

This document prepares the checkout API for a real HTTPS deployment. **Nothing
here deploys anything.** The current site build is static; checkout needs the
Node API below running as a persistent service.

## Recommended topology

Use one public HTTPS origin and reverse-proxy `/api/*` to the Node process:

```text
Browser ──HTTPS──> https://your-domain.example
                       ├── /              static Vite build (dist/)
                       └── /api/*         Node checkout API (port 8788)
                                              ├── Turso (hosted libSQL/SQLite)
                                              └── Stripe Checkout + webhook
```

Keeping the site and API on the same origin means the existing frontend
(`/api/...` fetches, httpOnly session cookie) works unchanged. Serving the API
on a separate domain is possible, but the frontend would also need an API base
URL change and cross-site cookie handling; it is not the supported path yet.

## What the API needs

- Node 22+ (Node 26 is used locally) and a persistent process.
- A public HTTPS hostname with `/api/*` routed to `server/index.mjs`.
- A Turso/libSQL database for production.
- A live Stripe account, live secret key, and a webhook signing secret.
- The static `dist/` build served from the same public origin.

The API binds to `HOST` (production default `0.0.0.0`) and `PORT` (default
`8788`). It speaks plain HTTP; TLS terminates at the hosting proxy/load
balancer. Forward `X-Forwarded-Proto: https` so session cookies are `Secure`.

## 1. Create the hosted database

Create a Turso database and token:

```sh
turso db create droprush-prod
turso db show droprush-prod --url
turso db tokens create droprush-prod
```

Put the values in the production environment:

```sh
TURSO_DATABASE_URL=libsql://droprush-prod-<org>.turso.io
TURSO_AUTH_TOKEN=<token>
```

The API creates/updates the schema automatically on startup (`schema.sql`).
`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are both required when
`NODE_ENV=production`; the server refuses to start with a missing or local-file
database.

## 2. Move the SQLite data

The local database is `.data/orders.db` by default. Export it to a reviewable
SQL file:

```sh
bun run db:export
# writes .data/turso-import.sql
```

Review what will be copied. **The local file contains development test
accounts and orders**; remove anything that should not become production data.
The export includes:

- `users` (including scrypt password hashes)
- `wants`
- `orders`
- `order_items`
- `order_events`

It intentionally **excludes `sessions`**. Existing browser sessions are
invalidated on deploy; users sign in again with their existing password.

Apply the export directly to Turso:

```sh
# .env contains TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
bun run db:push
```

Or import the generated SQL yourself:

```sh
turso db shell droprush-prod < .data/turso-import.sql
```

Both paths use `INSERT OR IGNORE`, so re-running is safe but will not overwrite
existing rows. To intentionally replace a row, delete it in Turso first or
start from a fresh database. Verify:

```sh
turso db shell droprush-prod "select count(*) from users;"
turso db shell droprush-prod "select count(*) from orders;"
```

## 3. Stripe webhook URL

The **exact path** is:

```text
/api/stripe/webhook
```

The exact absolute URL is built from `PUBLIC_API_URL`:

```text
${PUBLIC_API_URL}/api/stripe/webhook
```

For example, if `PUBLIC_API_URL=https://api.example.com`, the Stripe endpoint
is exactly:

```text
https://api.example.com/api/stripe/webhook
```

If the site and API share one origin (`https://example.com`), it is exactly:

```text
https://example.com/api/stripe/webhook
```

No query string, trailing slash, or port is added. `PUBLIC_API_URL` defaults to
`PUBLIC_SITE_URL` when omitted.

Print the resolved URL without starting the server:

```sh
NODE_ENV=production bun run check:deploy
# Stripe webhook URL: https://<your-api-host>/api/stripe/webhook
```

In Stripe Dashboard → Developers → Webhooks → Add endpoint, use that URL and
subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Copy the endpoint's signing secret (`whsec_...`) into
`STRIPE_WEBHOOK_SECRET`. The API verifies the Stripe signature against the raw
request body, requires `payment_status === "paid"`, and checks the session
amount and currency against the stored order before marking it paid. Duplicate
webhook deliveries are idempotent.

For local testing:

```sh
stripe listen --forward-to http://127.0.0.1:8788/api/stripe/webhook
# use the printed whsec_... as STRIPE_WEBHOOK_SECRET
```

## 4. Environment variables

Set these in the hosting provider's secret/environment store. Never commit
them or expose the Stripe secret to the browser.

| Variable | Required in production | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Yes, `production` | Enables fail-fast checks and disables demo checkout. |
| `HOST` | Yes, usually `0.0.0.0` | Interface the Node process binds. |
| `PORT` | Usually provided by host | HTTP port, default `8788`. |
| `PUBLIC_SITE_URL` | Yes | Customer-facing HTTPS origin; Stripe success/cancel URLs. |
| `PUBLIC_API_URL` | Recommended | Public HTTPS origin of the API; defaults to `PUBLIC_SITE_URL`. Builds the exact webhook URL. |
| `ALLOWED_ORIGINS` | Optional | Comma-separated browser origins allowed to call the API with cookies. Defaults to `PUBLIC_SITE_URL` (and localhost in development). |
| `TURSO_DATABASE_URL` | Yes | Hosted libSQL URL, e.g. `libsql://...turso.io`. |
| `TURSO_AUTH_TOKEN` | Yes | Turso database token. |
| `STRIPE_SECRET_KEY` | Yes | Stripe server key; use `sk_live_...` in production. |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret (`whsec_...`). |
| `ADMIN_TOKEN` | Yes | Long random bearer token protecting supplier order exports and the mark-sent action. |
| `TRUST_PROXY` | Recommended behind a proxy | Set `true` only when a trusted proxy is directly in front; uses `X-Forwarded-For` for rate limits. Secure cookies are detected from `X-Forwarded-Proto` regardless. |
| `ORDER_DB` | No | Local SQLite path fallback; ignored for production validation. |
| `API_PORT` | No | Legacy local alias for `PORT`. |

Production validation fails the process if `PUBLIC_SITE_URL`,
`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` or `ADMIN_TOKEN` is missing, if URLs are not HTTPS, or
if the database URL is a local `file:`. `ADMIN_TOKEN` must be at least 24
characters. It also warns if the Stripe key is still a test key.

## 5. Start the API

After installing dependencies on the host:

```sh
bun install --production
bun run start
```

The API startup log prints the listener, database driver, Stripe mode, and the
full webhook URL. Health check:

```sh
curl -fsS https://your-api-host.example/api/health
```

Expected shape:

```json
{
  "ok": true,
  "service": "droprush-api",
  "database": "turso",
  "stripe": "live",
  "webhook": {
    "path": "/api/stripe/webhook",
    "url": "https://your-api-host.example/api/stripe/webhook"
  }
}
```

A failing database check returns HTTP 503. Point the host's health check at
`/api/health`.

### Reverse proxy

The API itself does not terminate TLS. A minimal Caddy example:

```caddyfile
example.com {
    root * /srv/droprush/dist
    file_server

    reverse_proxy /api/* 127.0.0.1:8788 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-For {remote_host}
    }
}
```

If you use Nginx, proxy `/api/` to `127.0.0.1:8788`, set
`X-Forwarded-Proto $scheme` and `X-Forwarded-For $proxy_add_x_forwarded_for`,
and set `TRUST_PROXY=true`. Do not expose port 8788 directly to the internet.

## 6. Stripe checkout flow

With `STRIPE_SECRET_KEY` present:

1. `POST /api/checkout` validates the cart and shipping address server-side, then creates a `pending_payment` order with the address snapshot.
2. The API creates a Stripe Checkout Session with the order reference as `client_reference_id`.
3. The browser is redirected to Stripe's hosted checkout.
4. Stripe sends the signed webhook; the API verifies the signature, amount, and currency, then marks the order `paid` and sets `supplier_status='ready'`.
5. The confirmation page reads the order from `/api/orders/:ref`.

Success URL: `${PUBLIC_SITE_URL}/confirmation.html?ref=<order>&session_id=<stripe-session>`.
Cancel URL: `${PUBLIC_SITE_URL}/?checkout=canceled#shop`.

Without a key, local development still creates a clearly labelled test order.
With `NODE_ENV=production`, a missing key stops the API instead of allowing free
orders.

## 7. Supplier handoff

Paid orders are available to the supplier handoff tools once
`supplier_status='ready'`. Export a CSV for the supplier:

```sh
ADMIN_TOKEN=<production token> PUBLIC_API_URL=https://your-api-host.example \
  bun run supplier:export

# only one supplier's line items
ADMIN_TOKEN=... PUBLIC_API_URL=... \
  bun run supplier:export -- --supplier "Supplier name"

# include orders already marked sent
ADMIN_TOKEN=... PUBLIC_API_URL=... \
  bun run supplier:export -- --status all
```

After actually placing the purchase with the supplier, mark the order handed
off:

```sh
ADMIN_TOKEN=... PUBLIC_API_URL=... bun run supplier:mark-sent -- DR-XXXX-XXXX
```

This is an internal bookkeeping action; it does not place an order with the
supplier or send an email. The CSV contains the recipient, shipping address,
and one row per product, so a supplier can pack and ship the paid order.

Endpoints:

```text
GET  /api/supplier/orders?status=ready&supplier=...
GET  /api/supplier/orders.csv?status=ready&supplier=...
POST /api/supplier/orders/:ref/sent
```

All require `Authorization: Bearer $ADMIN_TOKEN`. Without `ADMIN_TOKEN` the
endpoints return 503; a wrong token returns 401. Do not put the token in
browser code or the static build.

## 8. Pre-deploy checks

These do not deploy anything:

```sh
bun run build
bun run check:deploy          # with production env loaded
node --env-file=.env.production scripts/export-db.mjs --apply
```

Then verify against a staging database/API:

- `GET /api/health` returns 200 and `database: "turso"`.
- Signup/login sets a `Secure` httpOnly cookie over HTTPS.
- Wants and orders survive an API restart.
- A Stripe test-mode payment marks the order paid, and replaying the webhook does not duplicate the payment event.
- A wrong amount in a signed webhook is rejected.
- The Stripe Dashboard webhook shows successful 2xx deliveries.
- The confirmation page loads the paid order.
- Authorized supplier JSON/CSV exports include the paid order's shipping address; a request without the bearer token returns 401.
- Marking an order sent removes it from the default supplier export and records `supplier_sent_at`.

## Operational notes

- **Backups:** enable Turso backups/point-in-time recovery before taking real orders.
- **Rate limiting:** the login/signup throttle is in-memory. Run a single API instance, or move throttling to a shared store before scaling horizontally.
- **Taxes/refunds/chargebacks:** Stripe handles processing and payouts; tax collection and refund policy remain your responsibility.
- **Supplier handoff:** this repository records the shipping address and exports paid orders, but does not place the supplier purchase or pay the supplier. Customer money settles to your Stripe account; supplier purchasing is a separate step.
- **Freebuff Sites:** the current `deploy.json` publishes only static assets. It cannot host this Node API or receive Stripe webhooks; the API needs a Node-capable HTTPS host.
