/**
 * DROPRUSH checkout API.
 *
 * Deploy this as a long-running Node service behind HTTPS. It persists to
 * hosted Turso/libSQL when TURSO_DATABASE_URL is set, and otherwise to the
 * local SQLite file for development. Production configuration is validated at
 * startup so a demo checkout or ephemeral database cannot go live by accident.
 */
import { createServer } from 'node:http'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { assertConfig, config } from './config.mjs'
import { openStore } from './store.mjs'
import {
  attachSession,
  createOrder,
  findProduct,
  getOrder,
  HttpError,
  markFailed,
  markPaid,
  publicOrder,
} from './core.mjs'
import { createCheckoutSession, verifyStripeSignature } from './stripe.mjs'
import {
  clearSessionCookie,
  hashPassword,
  hashToken,
  isSecureRequest,
  newSessionToken,
  SESSION_DAYS,
  sessionCookie,
  sessionTokenFrom,
  verifyPassword,
} from './auth.mjs'
import { buildForYou } from './recommend.mjs'

try {
  assertConfig()
} catch (error) {
  console.error(`[api] ${error.message}`)
  process.exit(1)
}

let store
try {
  store = await openStore(config)
} catch (error) {
  console.error('[api] Could not open the configured database:', error.message)
  process.exit(1)
}

const readBody = async (req, limit = 200_000) => {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new HttpError(413, 'Request body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const readJson = async (req) => {
  const raw = await readBody(req)
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

const json = (res, status, body) => {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  res.end(payload)
}

const isSameHostOrigin = (req, origin) => {
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

const isAllowedOrigin = (req) => {
  const origin = req.headers.origin
  if (!origin) return true
  if (config.allowedOrigins.has(origin)) return true
  // Local Vite proxies the API under a preview hostname; allow that same-host
  // case in development without weakening the production allowlist.
  return !config.production && isSameHostOrigin(req, origin)
}

const allowCors = (req, res) => {
  const origin = req.headers.origin
  if (!origin || !isAllowedOrigin(req)) return false
  res.setHeader('access-control-allow-origin', origin)
  res.setHeader('access-control-allow-credentials', 'true')
  res.setHeader('vary', 'Origin')
  return true
}

const clientIp = (req) => {
  if (config.trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    if (forwarded) return forwarded
  }
  return req.socket.remoteAddress || 'local'
}

const originFor = (req) =>
  config.publicSiteUrl || req.headers.origin || `http://localhost:${process.env.VITE_PORT || 3000}`

const publicUser = (user) => ({ id: user.id, email: user.email, name: user.name })

async function currentUser(req) {
  const token = sessionTokenFrom(req)
  if (!token) return null
  const tokenHash = hashToken(token)
  const row = await store.first(
    `SELECT u.id, u.email, u.name, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    [tokenHash]
  )
  if (!row) return null
  if (row.expires_at <= new Date().toISOString()) {
    await store.run(`DELETE FROM sessions WHERE token_hash = ?`, [tokenHash])
    return null
  }
  return { id: row.id, email: row.email, name: row.name }
}

async function startSession(req, res, user) {
  const token = newSessionToken()
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400 * 1000)
  await store.run(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    [hashToken(token), user.id, now.toISOString(), expires.toISOString()]
  )
  await store.run(`DELETE FROM sessions WHERE expires_at <= ?`, [now.toISOString()])
  res.setHeader('set-cookie', sessionCookie(token, isSecureRequest(req)))
}

const attempts = new Map()
function throttle(key, limit = 8, windowMs = 10 * 60 * 1000) {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || entry.reset < now) {
    attempts.set(key, { count: 1, reset: now + windowMs })
    return
  }
  entry.count += 1
  if (entry.count > limit) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.')
}

const wantIds = async (userId) =>
  (await store.query(`SELECT product_id FROM wants WHERE user_id = ? ORDER BY created_at DESC`, [userId])).map(
    (row) => row.product_id
  )

/* ── Supplier handoff (admin-token protected) ───────────── */

const sameAdminToken = (given) => {
  if (!config.adminToken || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(config.adminToken)
  return a.length === b.length && timingSafeEqual(a, b)
}

const requireSupplierAdmin = (req) => {
  if (!config.adminToken) {
    throw new HttpError(503, 'Supplier handoff is not configured. Set ADMIN_TOKEN on the API.')
  }
  const header = String(req.headers.authorization || '').trim()
  const supplied = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!sameAdminToken(supplied)) throw new HttpError(401, 'Invalid supplier admin token.')
}

async function supplierOrders(url) {
  const status = url.searchParams.get('status') || 'ready'
  if (!['ready', 'sent', 'all'].includes(status)) {
    throw new HttpError(400, 'status must be ready, sent or all.')
  }
  const supplier = String(url.searchParams.get('supplier') || '').trim()
  if (supplier.length > 80) throw new HttpError(400, 'Supplier name is too long.')

  const clauses = [`o.status = 'paid'`]
  const params = []
  if (status !== 'all') {
    clauses.push(`o.supplier_status = ?`)
    params.push(status)
  }
  if (supplier) {
    clauses.push(`i.supplier = ?`)
    params.push(supplier)
  }

  const rows = await store.query(
    `SELECT o.ref, o.created_at, o.paid_at, o.currency,
            o.supplier_status, o.supplier_sent_at, o.email,
            o.ship_name, o.ship_phone, o.ship_line1, o.ship_line2,
            o.ship_city, o.ship_region, o.ship_postal, o.ship_country,
            i.product_id, i.name AS item_name, i.supplier AS item_supplier,
            i.qty, i.unit_cents
       FROM orders o
       JOIN order_items i ON i.order_ref = o.ref
      WHERE ${clauses.join(' AND ')}
      ORDER BY COALESCE(o.paid_at, o.created_at) ASC, i.id ASC`,
    params
  )

  const byRef = new Map()
  for (const row of rows) {
    let order = byRef.get(row.ref)
    if (!order) {
      order = {
        reference: row.ref,
        createdAt: row.created_at,
        paidAt: row.paid_at,
        currency: row.currency,
        supplierStatus: row.supplier_status,
        supplierSentAt: row.supplier_sent_at,
        customer: { email: row.email },
        shipping: {
          name: row.ship_name,
          phone: row.ship_phone,
          line1: row.ship_line1,
          line2: row.ship_line2,
          city: row.ship_city,
          region: row.ship_region,
          postal: row.ship_postal,
          country: row.ship_country,
        },
        items: [],
      }
      byRef.set(row.ref, order)
    }
    order.items.push({
      productId: row.product_id,
      name: row.item_name,
      supplier: row.item_supplier,
      qty: row.qty,
      unit: row.unit_cents / 100,
      lineTotal: (row.unit_cents * row.qty) / 100,
    })
  }

  return { status, supplier: supplier || null, orders: [...byRef.values()] }
}

const csvCell = (value, { phone = false } = {}) => {
  let text = value === null || value === undefined ? '' : String(value)
  // Prefix formula-leading fields so a spreadsheet treats them as text. Keep
  // normal phone numbers intact, including a leading + or (.
  const safePhone = phone && /^\+?[0-9(][0-9\s().-]{5,24}$/.test(text)
  if (!safePhone && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function supplierCsv({ orders }) {
  const header = [
    'order_ref',
    'paid_at',
    'supplier_status',
    'supplier',
    'product_id',
    'product_name',
    'qty',
    'unit_price',
    'currency',
    'customer_name',
    'email',
    'phone',
    'address_line1',
    'address_line2',
    'city',
    'region',
    'postal_code',
    'country',
  ]
  const lines = [header.join(',')]
  for (const order of orders) {
    for (const item of order.items) {
      lines.push(
        [
          order.reference,
          order.paidAt,
          order.supplierStatus,
          item.supplier,
          item.productId,
          item.name,
          item.qty,
          item.unit.toFixed(2),
          order.currency,
          order.shipping.name,
          order.customer.email,
          order.shipping.phone,
          order.shipping.line1,
          order.shipping.line2,
          order.shipping.city,
          order.shipping.region,
          order.shipping.postal,
          order.shipping.country,
        ]
          // phone is zero-based column 11
          .map((cell, index) => csvCell(cell, { phone: index === 11 }))
          .join(',')
      )
    }
  }
  return `${lines.join('\r\n')}\r\n`
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname
  const origin = req.headers.origin
  const originAllowed = isAllowedOrigin(req)
  const corsAllowed = allowCors(req, res)

  try {
    if (req.method === 'OPTIONS') {
      if (!originAllowed) {
        json(res, 403, { error: 'Origin not allowed' })
        return
      }
      const headers = {
        allow: 'GET, POST, DELETE, OPTIONS',
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-max-age': '600',
      }
      if (corsAllowed) {
        headers['access-control-allow-origin'] = origin
        headers['access-control-allow-credentials'] = 'true'
        headers.vary = 'Origin'
      }
      res.writeHead(204, headers)
      res.end()
      return
    }

    // Reject cross-origin state changes from origins that are not configured.
    // Same-origin requests normally include Origin on POST/DELETE; Stripe
    // webhooks and server-to-server calls do not include it at all.
    if (!originAllowed && !['GET', 'HEAD'].includes(req.method)) {
      json(res, 403, { error: 'Origin not allowed' })
      return
    }

    if (path === '/api/health') {
      try {
        await store.first('SELECT 1 AS ok')
      } catch (error) {
        console.error('[api] health database check failed:', error.message)
        json(res, 503, { ok: false, database: store.kind, stripe: config.stripeMode })
        return
      }
      json(res, 200, {
        ok: true,
        service: 'droprush-api',
        environment: config.env,
        database: store.kind,
        stripe: config.stripeMode,
        webhook: { path: config.webhookPath, url: config.webhookUrl },
        time: new Date().toISOString(),
      })
      return
    }

    /* ── Accounts ─────────────────────────────────────────── */

    if (path === '/api/auth/me' && req.method === 'GET') {
      const user = await currentUser(req)
      json(res, 200, { user: user ? publicUser(user) : null })
      return
    }

    if (path === '/api/auth/signup' && req.method === 'POST') {
      throttle(`signup:${clientIp(req)}`, 6)
      const body = await readJson(req)
      const name = String(body.name || '').trim()
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')

      if (name.length < 1 || name.length > 60) throw new HttpError(400, 'Enter your name.')
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
        throw new HttpError(400, 'Enter a valid email address.')
      }
      if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters for your password.')

      const existing = await store.first(`SELECT id FROM users WHERE email = ?`, [email])
      if (existing) throw new HttpError(409, 'An account with that email already exists. Sign in instead.')

      const user = {
        id: `usr_${randomUUID()}`,
        email,
        name,
        created_at: new Date().toISOString(),
      }
      await store.run(
        `INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
        [user.id, user.email, user.name, hashPassword(password), user.created_at]
      )
      await startSession(req, res, user)
      json(res, 201, { user: publicUser(user) })
      return
    }

    if (path === '/api/auth/login' && req.method === 'POST') {
      const body = await readJson(req)
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      throttle(`login:${clientIp(req)}:${email}`, 8)

      const row = await store.first(`SELECT * FROM users WHERE email = ?`, [email])
      if (!row || !verifyPassword(password, row.password_hash)) {
        throw new HttpError(401, 'Email or password is incorrect.')
      }
      await startSession(req, res, row)
      json(res, 200, { user: publicUser(row) })
      return
    }

    if (path === '/api/auth/logout' && req.method === 'POST') {
      const token = sessionTokenFrom(req)
      if (token) await store.run(`DELETE FROM sessions WHERE token_hash = ?`, [hashToken(token)])
      res.setHeader('set-cookie', clearSessionCookie(isSecureRequest(req)))
      json(res, 200, { ok: true })
      return
    }

    /* ── Want-to-buy list ─────────────────────────────────── */

    if (path === '/api/wants' && req.method === 'GET') {
      const user = await currentUser(req)
      if (!user) throw new HttpError(401, 'Sign in to see your list.')
      json(res, 200, { ids: await wantIds(user.id) })
      return
    }

    if (path === '/api/wants' && req.method === 'POST') {
      const user = await currentUser(req)
      if (!user) throw new HttpError(401, 'Sign in to save items.')
      const body = await readJson(req)
      const product = findProduct(String(body.id || ''))
      if (!product) throw new HttpError(400, 'Unknown product.')
      await store.run(
        `INSERT OR IGNORE INTO wants (user_id, product_id, created_at) VALUES (?, ?, ?)`,
        [user.id, product.id, new Date().toISOString()]
      )
      json(res, 201, { ids: await wantIds(user.id) })
      return
    }

    if (path.startsWith('/api/wants/') && req.method === 'DELETE') {
      const user = await currentUser(req)
      if (!user) throw new HttpError(401, 'Sign in to change your list.')
      const id = decodeURIComponent(path.slice('/api/wants/'.length))
      await store.run(`DELETE FROM wants WHERE user_id = ? AND product_id = ?`, [user.id, id])
      json(res, 200, { ids: await wantIds(user.id) })
      return
    }

    /* ── For You ──────────────────────────────────────────── */

    if (path === '/api/for-you' && req.method === 'GET') {
      const user = await currentUser(req)
      json(res, 200, await buildForYou(store, user?.id ?? null))
      return
    }

    /* ── Orders ───────────────────────────────────────────── */

    if (path === '/api/orders' && req.method === 'GET') {
      const user = await currentUser(req)
      if (!user) throw new HttpError(401, 'Sign in to see your orders.')
      const rows = await store.query(
        `SELECT o.ref, o.created_at, o.status, o.total_cents,
                (SELECT COUNT(*) FROM order_items i WHERE i.order_ref = o.ref) AS items
           FROM orders o
          WHERE o.user_id = ?
          ORDER BY o.created_at DESC
          LIMIT 20`,
        [user.id]
      )
      json(res, 200, {
        orders: rows.map((row) => ({
          ref: row.ref,
          createdAt: row.created_at,
          status: row.status,
          total: row.total_cents / 100,
          items: row.items,
        })),
      })
      return
    }

    if (path === '/api/checkout' && req.method === 'POST') {
      const body = await readJson(req)
      const user = await currentUser(req)
      const email = String(body.email || user?.email || '')
        .trim()
        .toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
        throw new HttpError(400, 'Enter a valid email address for the order.')
      }
      const mode = config.stripeSecretKey ? 'stripe' : 'demo'
      const order = await createOrder(store, {
        items: body.items,
        email,
        shipping: body.shipping,
        mode,
        userId: user?.id ?? null,
      })

      if (!config.stripeSecretKey) {
        json(res, 201, {
          ok: true,
          mode: 'test',
          reference: order.reference,
          url: `/confirmation.html?ref=${encodeURIComponent(order.reference)}&demo=1`,
          message: 'No STRIPE_SECRET_KEY configured: test order recorded without payment.',
        })
        return
      }

      const session = await createCheckoutSession({
        secretKey: config.stripeSecretKey,
        order,
        origin: originFor(req),
      })
      await attachSession(store, order.reference, session.id)
      json(res, 201, { ok: true, mode: 'stripe', reference: order.reference, url: session.url })
      return
    }

    /* ── Supplier handoff export / sent marker ─────────────── */

    if (path.startsWith('/api/supplier/orders/') && req.method === 'POST') {
      requireSupplierAdmin(req)
      const match = path.match(/^\/api\/supplier\/orders\/([^/]+)\/sent$/)
      if (!match) throw new HttpError(404, 'Not found')
      const reference = decodeURIComponent(match[1])
      const order = await store.first(
        `SELECT ref, status, supplier_status FROM orders WHERE ref = ?`,
        [reference]
      )
      if (!order) throw new HttpError(404, 'Order not found')
      if (order.status !== 'paid') {
        throw new HttpError(409, 'Only paid orders can be marked handed off.')
      }
      if (order.supplier_status === 'sent') {
        json(res, 200, {
          ok: true,
          alreadySent: true,
          reference,
          supplierStatus: 'sent',
        })
        return
      }
      const now = new Date().toISOString()
      await store.batch([
        {
          sql: `UPDATE orders
                   SET supplier_status = 'sent', supplier_sent_at = ?
                 WHERE ref = ? AND status = 'paid'`,
          args: [now, reference],
        },
        {
          sql: `INSERT INTO order_events (order_ref, at, type, detail) VALUES (?, ?, ?, ?)`,
          args: [reference, now, 'supplier.handed_off', 'Marked as sent to supplier'],
        },
      ])
      json(res, 200, { ok: true, reference, supplierStatus: 'sent', supplierSentAt: now })
      return
    }

    if ((path === '/api/supplier/orders' || path === '/api/supplier/orders.csv') && req.method === 'GET') {
      requireSupplierAdmin(req)
      const result = await supplierOrders(url)
      if (path.endsWith('.csv')) {
        const payload = supplierCsv(result)
        const date = new Date().toISOString().slice(0, 10)
        res.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-length': Buffer.byteLength(payload),
          'content-disposition': `attachment; filename="droprush-supplier-${date}.csv"`,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        })
        res.end(payload)
        return
      }
      json(res, 200, {
        ...result,
        count: result.orders.length,
        itemCount: result.orders.reduce((total, order) => total + order.items.length, 0),
      })
      return
    }

    if (path.startsWith('/api/orders/') && req.method === 'GET') {
      const reference = decodeURIComponent(path.slice('/api/orders/'.length))
      const found = await getOrder(store, reference)
      if (!found) {
        json(res, 404, { error: 'Order not found' })
        return
      }
      json(res, 200, { order: publicOrder(found) })
      return
    }

    /* ── Stripe webhook ───────────────────────────────────── */

    if (path === config.webhookPath && req.method === 'POST') {
      const raw = await readBody(req)
      const signature = req.headers['stripe-signature']
      if (!(await verifyStripeSignature(raw, signature, config.stripeWebhookSecret))) {
        json(res, 400, { error: 'Invalid signature' })
        return
      }

      let event
      try {
        event = JSON.parse(raw)
      } catch {
        json(res, 400, { error: 'Invalid payload' })
        return
      }

      const session = event?.data?.object
      const reference = session?.client_reference_id || session?.metadata?.order_ref
      if (!reference) {
        json(res, 200, { received: true })
        return
      }

      const order = await store.first(
        `SELECT ref, status, currency, total_cents FROM orders WHERE ref = ?`,
        [reference]
      )
      if (!order) {
        console.warn('[stripe] webhook for unknown order:', reference)
        json(res, 200, { received: true })
        return
      }

      if (
        event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded'
      ) {
        if (session.payment_status !== 'paid') {
          json(res, 200, { received: true })
          return
        }
        const amount = Number(session.amount_total)
        if (
          !Number.isFinite(amount) ||
          amount !== Number(order.total_cents) ||
          String(session.currency || '').toLowerCase() !== String(order.currency || '').toLowerCase()
        ) {
          console.error('[stripe] payment amount does not match order:', reference)
          json(res, 400, { error: 'Payment amount does not match order' })
          return
        }
        await markPaid(store, {
          reference,
          sessionId: session.id,
          paymentIntent: session.payment_intent,
        })
      } else if (
        event.type === 'checkout.session.async_payment_failed' ||
        event.type === 'checkout.session.expired'
      ) {
        await markFailed(
          store,
          reference,
          event.type === 'checkout.session.expired' ? 'Checkout session expired' : 'Async payment failed'
        )
      }

      json(res, 200, { received: true })
      return
    }

    json(res, 404, { error: 'Not found' })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    if (status >= 500) console.error('[api]', error)
    json(res, status, { error: error.message || 'Unexpected error' })
  }
})

server.listen(config.port, config.host, () => {
  console.log(`[api] listening on http://${config.host}:${config.port} (${config.env})`)
  console.log(`[api] database: ${store.kind}`)
  console.log(`[api] stripe: ${config.stripeMode}`)
  console.log(`[api] webhook: ${config.webhookUrl || `${config.webhookPath} (set PUBLIC_API_URL to print the full URL)`}`)
})

server.on('error', async (error) => {
  console.error('[api] server error:', error.message)
  await store.close().catch(() => {})
  process.exit(1)
})

let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[api] ${signal}: closing`)
  server.close(async () => {
    await store.close().catch(() => {})
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
