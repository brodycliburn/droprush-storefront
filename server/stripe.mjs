const encoder = new TextEncoder()

const STRIPE_API = 'https://api.stripe.com/v1/checkout/sessions'

/**
 * Creates a hosted Stripe Checkout session in test or live mode depending on
 * the secret key supplied. Returns the created session (url, id, ...).
 */
export async function createCheckoutSession({ secretKey, order, origin }) {
  const params = new URLSearchParams()
  params.set('mode', 'payment')
  params.set('success_url', `${origin}/confirmation.html?ref=${order.reference}&session_id={CHECKOUT_SESSION_ID}`)
  params.set('cancel_url', `${origin}/?checkout=canceled#shop`)
  params.set('client_reference_id', order.reference)
  params.set('metadata[order_ref]', order.reference)

  order.lines.forEach((line, index) => {
    params.set(`line_items[${index}][quantity]`, String(line.qty))
    params.set(`line_items[${index}][price_data][currency]`, 'usd')
    params.set(`line_items[${index}][price_data][unit_amount]`, String(line.unit))
    params.set(`line_items[${index}][price_data][product_data][name]`, line.product.name)
  })

  if (order.shipping > 0) {
    const index = order.lines.length
    params.set(`line_items[${index}][quantity]`, '1')
    params.set(`line_items[${index}][price_data][currency]`, 'usd')
    params.set(`line_items[${index}][price_data][unit_amount]`, String(order.shipping))
    params.set(`line_items[${index}][price_data][product_data][name]`, 'Supplier shipping')
  }

  const res = await fetch(STRIPE_API, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error?.message || `Stripe rejected the session (HTTP ${res.status})`)
  }
  return data
}

export async function retrieveSession(secretKey, sessionId) {
  const res = await fetch(`${STRIPE_API}/${encodeURIComponent(sessionId)}`, {
    headers: { authorization: `Bearer ${secretKey}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `Stripe lookup failed (HTTP ${res.status})`)
  return data
}

/** Verifies a `Stripe-Signature` header against the raw request body. */
export async function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !secret) return false
  const parts = header.split(',').map((part) => part.split('='))
  const timestamp = parts.find(([k]) => k === 't')?.[1]
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!timestamp || !signatures.length) return false

  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`))
  const expected = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')

  return signatures.some((candidate) => constantTimeEqual(candidate, expected))
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
