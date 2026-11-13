import catalog from '../src/catalog.js'

export const FREE_SHIPPING_CENTS = 3500
export const SHIPPING_CENTS = 490
export const MAX_QTY = 20

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const findProduct = (id) => catalog.find((p) => p.id === id)

export function priceOrder(items) {
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'Cart is empty')
  if (items.length > 40) throw new HttpError(400, 'Too many line items')

  const lines = []
  let subtotal = 0

  for (const item of items) {
    const product = findProduct(String(item?.id ?? ''))
    if (!product) throw new HttpError(400, `Unknown product: ${item?.id}`)
    const qty = Number(item?.qty)
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw new HttpError(400, `Invalid quantity for ${product.name}`)
    }
    const unit = Math.round(product.price * 100)
    subtotal += unit * qty
    lines.push({ product, qty, unit })
  }

  const shipping = subtotal >= FREE_SHIPPING_CENTS ? 0 : SHIPPING_CENTS
  return { lines, subtotal, shipping, total: subtotal + shipping }
}

/** Validates and normalises the address saved for the supplier handoff. */
export function normalizeShipping(input) {
  if (!input || typeof input !== 'object') {
    throw new HttpError(400, 'Enter a shipping address.')
  }

  const field = (key, label, { min = 0, max = 120, optional = false } = {}) => {
    const raw = input[key]
    if (raw !== null && raw !== undefined && !['string', 'number'].includes(typeof raw)) {
      throw new HttpError(400, 'Enter the shipping address fields as text.')
    }
    const value = String(raw ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!value && optional) return ''
    if (!value) throw new HttpError(400, `Enter ${label}.`)
    if (value.length < min) throw new HttpError(400, `${label[0].toUpperCase()}${label.slice(1)} is too short.`)
    if (value.length > max) throw new HttpError(400, `${label[0].toUpperCase()}${label.slice(1)} is too long.`)
    return value
  }

  const shipping = {
    name: field('name', "the recipient's full name", { min: 2, max: 80 }),
    phone: field('phone', 'a phone number', { max: 25, optional: true }),
    line1: field('line1', 'the street address', { min: 4, max: 120 }),
    line2: field('line2', 'the second address line', { max: 120, optional: true }),
    city: field('city', 'the city', { min: 2, max: 80 }),
    region: field('region', 'the state or region', { min: 2, max: 80 }),
    postal: field('postal', 'the postal code', { min: 2, max: 16 }),
    country: field('country', 'the country', { min: 2, max: 2 }).toUpperCase(),
  }

  if (!/^[A-Za-z]{2}$/.test(shipping.country)) {
    throw new HttpError(400, 'Use a two-letter country code, for example US or GB.')
  }
  if (shipping.phone && !/^[+()\d\s.-]{7,25}$/.test(shipping.phone)) {
    throw new HttpError(400, 'Enter a valid phone number or leave it blank.')
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,15}$/.test(shipping.postal)) {
    throw new HttpError(400, 'Enter a valid postal code.')
  }

  return shipping
}

export function newReference() {
  const stamp = Date.now().toString(36).toUpperCase()
  const tail = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()
  return `DR-${stamp}-${tail}`
}

/**
 * Persists an order + line items. `store` is a tiny adapter:
 *   query(sql, params) -> rows[], first(sql, params) -> row|null, run(sql, params)
 */
export async function createOrder(store, { items, email = null, mode = 'stripe', userId = null, shipping }) {
  const priced = priceOrder(items)
  const address = normalizeShipping(shipping)
  const reference = newReference()
  const now = new Date().toISOString()
  const status = mode === 'stripe' ? 'pending_payment' : 'test'

  const statements = [
    {
      sql: `INSERT INTO orders
              (ref, created_at, status, email, user_id, ship_name, ship_phone, ship_line1,
               ship_line2, ship_city, ship_region, ship_postal, ship_country,
               currency, subtotal_cents, shipping_cents, total_cents)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'usd', ?, ?, ?)`,
      args: [
        reference,
        now,
        status,
        email,
        userId,
        address.name,
        address.phone || null,
        address.line1,
        address.line2 || null,
        address.city,
        address.region,
        address.postal,
        address.country,
        priced.subtotal,
        priced.shipping,
        priced.total,
      ],
    },
    ...priced.lines.map((line) => ({
      sql: `INSERT INTO order_items (order_ref, product_id, name, supplier, unit_cents, qty)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [reference, line.product.id, line.product.name, line.product.supplier, line.unit, line.qty],
    })),
    {
      sql: `INSERT INTO order_events (order_ref, at, type, detail) VALUES (?, ?, ?, ?)`,
      args: [
        reference,
        now,
        'order.created',
        `${priced.lines.length} line item(s) · ${mode === 'stripe' ? 'Stripe checkout' : 'test checkout, no payment'}`,
      ],
    },
    {
      sql: `INSERT INTO order_events (order_ref, at, type, detail) VALUES (?, ?, ?, ?)`,
      args: [reference, now, 'shipping.captured', 'Shipping address captured'],
    },
  ]
  await store.batch(statements)

  return { reference, ...priced }
}

export async function attachSession(store, reference, sessionId) {
  const now = new Date().toISOString()
  await store.batch([
    { sql: `UPDATE orders SET stripe_session_id = ? WHERE ref = ?`, args: [sessionId, reference] },
    {
      sql: `INSERT INTO order_events (order_ref, at, type, detail) VALUES (?, ?, ?, ?)`,
      args: [reference, now, 'checkout.session.created', sessionId],
    },
  ])
}

export async function markPaid(store, { reference, sessionId = null, paymentIntent = null }) {
  const current = await store.first(`SELECT status FROM orders WHERE ref = ?`, [reference])
  if (!current || current.status === 'paid') return false
  const now = new Date().toISOString()
  await store.batch([
    {
      sql: `UPDATE orders
               SET status = 'paid',
                   paid_at = ?,
                   stripe_session_id = COALESCE(?, stripe_session_id),
                   stripe_payment_intent = COALESCE(?, stripe_payment_intent),
                   supplier_status = 'ready'
             WHERE ref = ? AND status <> 'paid'`,
      args: [now, sessionId, paymentIntent, reference],
    },
    {
      sql: `INSERT INTO order_events (order_ref, at, type, detail) VALUES (?, ?, ?, ?)`,
      args: [reference, now, 'payment.captured', paymentIntent || sessionId || 'stripe'],
    },
  ])
  return true
}

export async function markFailed(store, reference, reason) {
  const current = await store.first(`SELECT status FROM orders WHERE ref = ?`, [reference])
  if (!current || current.status === 'paid' || current.status === 'payment_failed') return false
  const now = new Date().toISOString()
  await store.batch([
    {
      sql: `UPDATE orders SET status = 'payment_failed' WHERE ref = ? AND status <> 'paid'`,
      args: [reference],
    },
    {
      sql: `INSERT INTO order_events (order_ref, at, type, detail) VALUES (?, ?, ?, ?)`,
      args: [reference, now, 'payment.failed', reason],
    },
  ])
  return true
}

export async function getOrder(store, reference) {
  const order = await store.first(`SELECT * FROM orders WHERE ref = ?`, [reference])
  if (!order) return null
  const items = await store.query(`SELECT * FROM order_items WHERE order_ref = ? ORDER BY id`, [reference])
  const events = await store.query(`SELECT * FROM order_events WHERE order_ref = ? ORDER BY id`, [reference])
  return { order, items, events }
}

/** Shapes an order for the confirmation page (money in dollars, image included). */
export function publicOrder({ order, items, events }) {
  return {
    reference: order.ref,
    status: order.status,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    subtotal: order.subtotal_cents / 100,
    shipping: order.shipping_cents / 100,
    total: order.total_cents / 100,
    supplierStatus: order.supplier_status,
    tracking: order.tracking_number
      ? { carrier: order.carrier, number: order.tracking_number, url: order.tracking_url }
      : null,
    items: items.map((item) => ({
      id: item.product_id,
      name: item.name,
      supplier: item.supplier,
      price: item.unit_cents / 100,
      qty: item.qty,
      img: findProduct(item.product_id)?.img ?? null,
    })),
    events: events.map((event) => ({ at: event.at, type: event.type, detail: event.detail })),
  }
}
