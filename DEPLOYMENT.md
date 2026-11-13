# DROPRUSH deployment runbook

This document prepares the checkout API for a real HTTPS deployment. **Nothing
in this repository deploys automatically.** The current site build is static;
checkout needs the Node API below running as a persistent service.

## Recommended topology

Use one public HTTPS origin and reverse-proxy `/api/*` to the Node process:

```text
Browser ──HTTPS──> https://your-domain.example
                       ├── /              static Vite build (dist/)
                       └── /api/*         Node checkout API
                                             (port 8080 on App Platform;
                                              port 8788 locally)
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

The repository includes [`app.yaml`](app.yaml), a DigitalOcean App Platform
template that runs the static site and API on one origin. It contains
placeholders and does not deploy anything by itself; see [section 5](#5-deploy-on-digitalocean-app-platform).

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

## 3. Stripe webhook URL and setup checklist

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

### Stripe webhook setup checklist

Use **live mode** for the production endpoint. Test-mode endpoints and signing
secrets are separate; do not reuse them.

- [ ] Endpoint is exactly `https://shop.example.com/api/stripe/webhook`, with no trailing slash.
- [ ] The endpoint subscribes to:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
- [ ] The signing secret is stored as `STRIPE_WEBHOOK_SECRET` on the API service only.
- [ ] `NODE_ENV=production node --env-file=.env.production scripts/check-deploy.mjs` prints the same absolute webhook URL.
- [ ] The API is redeployed after setting or rotating the secret.
- [ ] A Stripe Dashboard test delivery returns 2xx.
- [ ] A low-value live checkout marks the order paid and `supplier_status='ready'`.
- [ ] Replaying the same signed event does not duplicate the payment event.
- [ ] A signed event with the wrong amount or currency is rejected.

## 4. Environment variables

Set these in the hosting provider's secret/environment store. Never commit
them or expose the Stripe secret to the browser.

| Variable | Required in production | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Yes, `production` | Enables fail-fast checks and disables demo checkout. |
| `HOST` | Yes, usually `0.0.0.0` | Interface the Node process binds. |
| `PORT` | Usually provided by host | HTTP port. App Platform uses `8080`; local default is `8788`. |
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

## 5. Deploy on DigitalOcean App Platform

The root [`app.yaml`](app.yaml) is an App Platform spec for this repository. It
is a template: replace every `CHANGE_ME` and example value before using it. It
does not deploy anything by itself.

One app runs both components on one origin:

| Component | Type | Build | Run / output |
| --- | --- | --- | --- |
| `api` | Web service | `bun install --frozen-lockfile` | `node server/index.mjs`, HTTP port `8080` |
| `web` | Static site | `bun run build` | `dist/` |

Use the plan `apps-s-1vcpu-0.5gb` ($5/month) and **one** `api` instance. The
login/signup throttle is in memory, so do not scale the API horizontally
without moving it to shared storage. Do not add a DigitalOcean managed
database; Turso is the database.

### 5.1 Replace the app.yaml placeholders

Before creating the app, replace:

- `name` and `region` (choose the region closest to Turso)
- both `github.repo` values with `<owner>/<repo>`
- `domains[0].domain` and every `shop.example.com` value
- `PUBLIC_SITE_URL`, `PUBLIC_API_URL`, and `ALLOWED_ORIGINS`
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- `ADMIN_TOKEN` with the output of `openssl rand -hex 32`

The four credentials are marked `type: SECRET` in the spec. Do not commit real
values. `ADMIN_TOKEN=CHANGE_ME` is intentionally shorter than the 24-character
minimum, so the API will not boot until it is replaced. The Stripe secret is
also a placeholder, not a working key.

### 5.2 Create and configure the app

1. Push the repository to GitHub/GitLab. App Platform deploys from Git, not
   from the local working directory.
2. In the DigitalOcean Control Panel, open **Apps → Create App**, select the
   repository and branch, and accept the detected Bun buildpack. App Platform
   installs Node 22 because the package scripts use Node.
3. Create the `api` web service and `web` static site with the values above.
   The spec defines both; if you use the CLI, run this only after replacing
   every placeholder:
   ```sh
   doctl apps create --spec app.yaml
   ```
   This command creates and deploys the app. Do not run it as part of this
   change.
4. Confirm the ingress rules:

   | Path | Path handling | Component |
   | --- | --- | --- |
   | `/api` | **Preserve Full Path** | `api` |
   | `/` | Default | `web` |

   In the Control Panel this is under **Networking → Component routing**. In
   the spec it is `preserve_path_prefix: true` on the `api` component. Keep the
   `/api` rule before the `/` fallback.

5. Set the API health check to `/api/health`. The API listens on port `8080`.
6. Do not add a database component, and do not set `ORDER_DB` on the API.
7. Add the custom domain and TLS using the checklist below.

**Important:** without full path preservation, App Platform forwards
`/api/health` as `/health`; the API returns 404 and the health check fails.

### 5.3 DNS and TLS checklist

- [ ] Add `shop.example.com` under **Networking → Domains → Add domain**.
- [ ] Choose **You manage your domain** and copy the `<app>.ondigitalocean.app` CNAME target, or **We manage your domain** and set DigitalOcean's nameservers at the registrar.
- [ ] Create the DNS record: `CNAME shop <app>.ondigitalocean.app` with a 300-second TTL. For an apex domain, use CNAME flattening or App Platform's A records.
- [ ] If the domain has CAA records, allow both `letsencrypt.org` and `pki.goog`.
- [ ] Wait for the domain to become active. App Platform provisions and renews TLS automatically and redirects HTTP to HTTPS.
- [ ] Set `PUBLIC_SITE_URL`, `PUBLIC_API_URL`, and `ALLOWED_ORIGINS` to `https://shop.example.com`; redeploy the API after changing them.
- [ ] `curl -I https://shop.example.com` returns HTTPS with a valid certificate.
- [ ] Sign in and confirm the session cookie is `Secure`.

App Platform does not add HSTS headers. Add HSTS in the app if required. Keep
`TRUST_PROXY=true` so rate limiting uses the forwarded client IP. A subdomain
is simpler than an apex domain; DNS changes can take up to 72 hours.

### 5.4 App Platform setup checklist

- [ ] `app.yaml` placeholders are replaced; no `CHANGE_ME` remains.
- [ ] `github.repo`, branch, app name, and region are correct.
- [ ] `api` uses `node server/index.mjs` on port `8080`.
- [ ] `/api` uses **Preserve Full Path**.
- [ ] Health check is `/api/health`.
- [ ] `web` builds `dist/` with `bun run build`.
- [ ] Environment variables are on `api` only; secrets are marked `SECRET`.
- [ ] One API instance is configured.
- [ ] No DigitalOcean managed database was added.
- [ ] DNS/TLS checklist is complete.

## 6. Start the API

On App Platform, the `api` component runs the commands from `app.yaml`; skip
the manual install, start, and reverse-proxy steps. The platform terminates
TLS and forwards HTTPS requests to port `8080`.

For a manual host, after installing dependencies:

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

App Platform does not use this section; it handles TLS and routing. For a
manual host, the API itself does not terminate TLS. A minimal Caddy example:

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

## 7. Stripe checkout flow

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

## 8. Supplier handoff

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

### ADMIN_TOKEN checklist

- [ ] Generate a 64-character token with `openssl rand -hex 32`; store it in a password manager.
- [ ] Replace `ADMIN_TOKEN=CHANGE_ME` in `app.yaml` (or the App Platform environment) with that value.
- [ ] Keep `ADMIN_TOKEN` on the `api` component only; never in the static site, browser code, `VITE_*`, or Git.
- [ ] Set `PUBLIC_API_URL=https://shop.example.com` when running the CLI; it otherwise defaults to localhost.
- [ ] `ADMIN_TOKEN=... PUBLIC_API_URL=... bun run supplier:export` writes a mode-600 CSV.
- [ ] A request without a bearer token returns 401; with the token it returns only paid `ready` orders.
- [ ] `supplier:mark-sent` is idempotent and removes the order from the default export.
- [ ] Treat the CSV as PII; it contains names, addresses, and contact details.
- [ ] Rotate the token immediately if it is exposed, and update the App Platform secret and CLI.

## 9. Pre-deploy checks

These do not deploy anything:

```sh
bun run build
bun run check:deploy          # with production env loaded
node --env-file=.env.production scripts/export-db.mjs --apply
```

Then verify against a staging or App Platform deployment:

- [ ] `GET /api/health` returns 200 and `database: "turso"`.
- [ ] App Platform `/api` uses **Preserve Full Path**, and the health check is `/api/health`.
- [ ] `app.yaml` has no `CHANGE_ME`; domain, repo, and environment are correct.
- [ ] The custom domain is active and the HTTPS certificate is valid.
- [ ] Signup/login sets a `Secure` httpOnly cookie over HTTPS.
- [ ] Wants and orders survive an API restart.
- [ ] A Stripe test-mode payment marks the order paid, and replaying the webhook does not duplicate the payment event.
- [ ] A wrong amount in a signed webhook is rejected.
- [ ] The Stripe Dashboard webhook shows successful 2xx deliveries.
- [ ] The confirmation page loads the paid order.
- [ ] Authorized supplier JSON/CSV exports include the paid order's shipping address; a request without the bearer token returns 401.
- [ ] Marking an order sent removes it from the default supplier export and records `supplier_sent_at`.

## Operational notes

- **App Platform:** one `api` instance and one `web` static site in a single app; do not add a DigitalOcean managed database or set `ORDER_DB` in production.
- **Backups:** enable Turso backups/point-in-time recovery before taking real orders.
- **Rate limiting:** the login/signup throttle is in-memory. Run a single API instance, or move throttling to a shared store before scaling horizontally.
- **Taxes/refunds/chargebacks:** Stripe handles processing and payouts; tax collection and refund policy remain your responsibility.
- **Supplier handoff:** this repository records the shipping address and exports paid orders, but does not place the supplier purchase or pay the supplier. Customer money settles to your Stripe account; supplier purchasing is a separate step.
- **Freebuff Sites:** the current `deploy.json` publishes only static assets. It cannot host this Node API or receive Stripe webhooks; the API needs a Node-capable HTTPS host.
