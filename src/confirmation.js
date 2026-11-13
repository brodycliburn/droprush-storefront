import './style.css'
import './confirmation.css'

const CART_KEY = 'droprush-cart-v2'
const params = new URLSearchParams(location.search)
const reference = params.get('ref')
const card = document.getElementById('confirmCard')

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const money = (n) => `$${Number(n).toFixed(2)}`

const dateLabel = (iso) => {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const statusMeta = (status) => {
  switch (status) {
    case 'paid':
      return { label: 'Paid', cls: 'is-paid' }
    case 'test':
      return { label: 'Test order', cls: 'is-test' }
    case 'payment_failed':
      return { label: 'Payment failed', cls: 'is-failed' }
    default:
      return { label: 'Awaiting payment', cls: 'is-pending' }
  }
}

function fail(message) {
  card.innerHTML = `<div class="confirm__error">
      <h1>We couldn't find that order</h1>
      <p>${esc(message)}</p>
      <a class="btn btn--primary" href="/">Back to the shop</a>
    </div>`
}

function render(order) {
  const status = statusMeta(order.status)
  const isTest = order.status === 'test'
  const paid = order.status === 'paid'

  card.innerHTML = `
    <div class="confirm__head">
      <span class="confirm__icon" aria-hidden="true">${paid || isTest ? '✓' : '⏳'}</span>
      <div>
        <p class="confirm__eyebrow">${isTest ? 'Test order recorded' : paid ? 'Payment received' : 'Order created'}</p>
        <h1>${paid ? 'Thanks — your order is in.' : isTest ? 'Test order created.' : 'Finish your payment.'}</h1>
        <p class="confirm__lede">
          ${
            isTest
              ? 'No payment was taken. This order is saved with its shipping address so supplier handoff can attach to it.'
              : 'We saved this order with its line items and shipping address. Supplier handoff and tracking attach to the same reference.'
          }
        </p>
      </div>
      <span class="confirm__status ${status.cls}">${status.label}</span>
    </div>

    <div class="confirm__refrow">
      <span class="confirm__reflabel">Order reference</span>
      <code class="confirm__ref" id="orderRef">${esc(order.reference)}</code>
      <button class="confirm__copy" type="button" id="copyRef">Copy</button>
      <span class="confirm__placed">Placed ${esc(dateLabel(order.createdAt))}</span>
    </div>

    ${
      isTest
        ? `<p class="confirm__demo"><b>Test mode.</b> Set <code>STRIPE_SECRET_KEY</code> on the checkout API to send customers to Stripe Checkout instead.</p>`
        : ''
    }

    <h2 class="confirm__h2">Your items</h2>
    <ul class="confirm-items">
      ${order.items
        .map(
          (item) => `<li class="confirm-item">
            ${item.img ? `<img src="${esc(item.img)}" alt="" width="64" height="64" loading="lazy" />` : '<span class="confirm-item__blank"></span>'}
            <div>
              <p class="confirm-item__name">${esc(item.name)}</p>
              <p class="confirm-item__meta">${esc(item.supplier)} · Qty ${item.qty}</p>
            </div>
            <span class="confirm-item__price">${money(item.price * item.qty)}</span>
          </li>`
        )
        .join('')}
    </ul>

    <div class="confirm__totals">
      <div><span>Subtotal</span><b>${money(order.subtotal)}</b></div>
      <div><span>Shipping</span><b>${order.shipping === 0 ? 'Free' : money(order.shipping)}</b></div>
      <div class="confirm__total"><span>Total</span><b>${money(order.total)}</b></div>
    </div>

    <h2 class="confirm__h2">What happens next</h2>
    <ol class="confirm__steps">
      <li class="is-done"><b>Order saved</b><span>${esc(dateLabel(order.createdAt))}</span></li>
      <li class="${paid || isTest ? 'is-done' : 'is-current'}">
        <b>${paid ? 'Payment captured' : isTest ? 'Test checkout — no payment' : 'Payment pending'}</b>
        <span>${paid ? esc(dateLabel(order.paidAt)) : isTest ? 'Stripe test key not configured' : 'Complete the hosted checkout'}</span>
      </li>
      <li class="${
        order.supplierStatus === 'sent'
          ? 'is-done'
          : order.supplierStatus === 'ready' || isTest
            ? 'is-current'
            : ''
      }">
        <b>Supplier handoff</b>
        <span>${
          order.supplierStatus === 'sent'
            ? 'Handed off to the supplier'
            : order.supplierStatus === 'ready'
              ? 'Ready for supplier handoff'
              : isTest
                ? 'Recorded, not sent to a supplier'
                : 'Starts after payment'
        }</span>
      </li>
      <li class="${order.tracking ? 'is-done' : ''}">
        <b>Shipped · 7–12 days tracked</b>
        <span>${
          order.tracking
            ? `${esc(order.tracking.carrier || 'Carrier')} · ${esc(order.tracking.number)}`
            : 'Tracking appears here when the supplier ships'
        }</span>
      </li>
    </ol>

    <div class="confirm__actions">
      <a class="btn btn--primary" href="/#shop">Keep shopping</a>
      <button class="btn btn--soft" type="button" id="printOrder">Print receipt</button>
    </div>
  `

  document.getElementById('copyRef')?.addEventListener('click', async (event) => {
    const button = event.currentTarget
    try {
      await navigator.clipboard.writeText(order.reference)
      button.textContent = 'Copied'
      setTimeout(() => (button.textContent = 'Copy'), 1600)
    } catch {
      button.textContent = order.reference
    }
  })

  document.getElementById('printOrder')?.addEventListener('click', () => window.print())

  if (order.status === 'paid' || order.status === 'test') {
    try {
      localStorage.removeItem(CART_KEY)
    } catch {
      /* storage unavailable */
    }
  }
}

async function load() {
  if (!reference) {
    fail('No order reference was supplied in the link.')
    return
  }

  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(reference)}`, { cache: 'no-store' })
    if (res.status === 404) {
      fail(`There is no order with the reference ${reference}.`)
      return
    }
    if (!res.ok) throw new Error(`The order service answered ${res.status}.`)
    const data = await res.json()
    if (!data?.order) throw new Error('The order could not be read.')
    render(data.order)
  } catch (error) {
    fail(`${error.message} Check that the checkout API is running, then reload this page.`)
  }
}

load()
