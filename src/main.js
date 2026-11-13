import './style.css'
import catalog from './catalog.js'

/* ────────────────────────────────────────────────────────────
   Product art: real photos from public/products, with the
   line-illustration set kept as the offline / failed-load
   fallback so a grid never looks broken.
   ──────────────────────────────────────────────────────────── */

const GLYPHS = {
  earbuds:
    '<circle cx="45" cy="47" r="11"/><path d="M45 58v16a6 6 0 0 0 12 0v-8"/><circle cx="79" cy="57" r="9"/><path d="M79 66v13a5 5 0 0 0 10 0v-9"/>',
  projector:
    '<circle cx="60" cy="55" r="9"/><path d="M38 69h44"/><path d="M40 40a26 26 0 0 1 40 0"/><path d="M60 69v13"/><path d="M48 82h24"/><path d="M27 42l9 7M93 42l-9 7"/>',
  blender:
    '<path d="M46 31h28l-5 38H51z"/><rect x="42" y="69" width="36" height="24" rx="7"/><path d="M56 43h9M54 53h14"/><circle cx="60" cy="80" r="3"/>',
  bottle:
    '<rect x="50" y="23" width="20" height="9" rx="3"/><path d="M52 32h16v9c8 4 10 10 10 18v25a8 8 0 0 1-8 8H50a8 8 0 0 1-8-8V59c0-8 2-14 10-18z"/><path d="M45 64h30"/><path d="M45 76h30"/>',
  watch:
    '<rect x="42" y="40" width="36" height="40" rx="11"/><path d="M50 40V26h20v14M50 80v14h20V80"/><path d="M60 52v9l6 4"/>',
  petbed:
    '<ellipse cx="60" cy="70" rx="32" ry="16"/><path d="M28 70c0-13 14-22 32-22s32 9 32 22"/><path d="M47 65c0-6 6-10 13-10s13 4 13 10"/>',
  powerbank:
    '<rect x="37" y="41" width="46" height="46" rx="11"/><path d="M63 49l-11 17h9l-4 13 12-18h-9z"/>',
  mug:
    '<path d="M37 44h33v31a12 12 0 0 1-12 12H49a12 12 0 0 1-12-12z"/><path d="M70 52h8a9 9 0 0 1 0 18h-8"/><path d="M49 34c0 4 4 4 4 8M60 31c0 4 4 4 4 8"/>',
  bowl:
    '<path d="M29 55h62c0 17-13 29-31 29S29 72 29 55z"/><path d="M24 55h72"/><path d="M52 43c0-4 4-4 4-8M65 43c0-4 4-4 4-8"/>',
  toothbrush:
    '<rect x="52" y="24" width="15" height="27" rx="7"/><path d="M55 51h9v33a4.5 4.5 0 0 1-9 0z"/><circle cx="59.5" cy="33" r="2.6"/><path d="M56 24v-4M63 24v-4"/>',
  sleepmask:
    '<path d="M30 49h60c0 16-11 25-30 25S30 65 30 49z"/><path d="M30 49H17M90 49h13"/><path d="M45 58c4 4 10 4 14 0M61 58c4 4 10 4 14 0"/>',
  mister:
    '<path d="M47 42h26l5 42H42z"/><rect x="52" y="30" width="16" height="12" rx="3"/><path d="M78 40l10-6M81 46h12M79 52l10 6"/>',
  bands:
    '<ellipse cx="47" cy="50" rx="19" ry="10" transform="rotate(-22 47 50)"/><ellipse cx="73" cy="71" rx="19" ry="10" transform="rotate(-22 73 71)"/>',
  photo:
    '<rect x="28" y="36" width="64" height="48" rx="8"/><circle cx="60" cy="58" r="11"/><path d="M45 36l5-8h20l5 8"/><circle cx="80" cy="47" r="2.4"/>',
}

const GLYPH_RULES = [
  [/earbud|earphone|headphone/i, 'earbuds'],
  [/speaker/i, 'projector'],
  [/blender/i, 'blender'],
  [/lamp/i, 'projector'],
  [/battery|charger/i, 'powerbank'],
  [/watch/i, 'watch'],
  [/mascara|lipstick|polish/i, 'toothbrush'],
  [/lotion|body wash/i, 'bottle'],
  [/dog food|cat food|lunch box/i, 'bowl'],
  [/glasses/i, 'sleepmask'],
  [/plant pot/i, 'mister'],
  [/mug tree|powder/i, 'mug'],
]

const PALETTES = [
  { from: '#e9f1ff', to: '#c3d7ff', ink: '#16305c' },
  { from: '#ffe8db', to: '#ffc0a0', ink: '#6b2e12' },
  { from: '#e9f7e6', to: '#bfe8b8', ink: '#1e4a24' },
  { from: '#f3e8ff', to: '#d8befc', ink: '#3d2168' },
  { from: '#fff7d9', to: '#ffe08a', ink: '#5c4409' },
  { from: '#e6f7f9', to: '#b9e6ee', ink: '#0d3f4a' },
  { from: '#ffe8ef', to: '#ffbcd1', ink: '#5f1631' },
  { from: '#eef1f5', to: '#cfd6e0', ink: '#22303f' },
  { from: '#f7e7e2', to: '#e9c4b6', ink: '#4d2318' },
]

/* ── Catalogue (photo-backed) ──────────────────────────────── */

const glyphFor = (product) => {
  const hit = GLYPH_RULES.find(([re]) => re.test(product.name))
  return hit ? hit[1] : 'photo'
}

const PRODUCTS = catalog.map((product, index) => ({
  ...product,
  pal: index % PALETTES.length,
  glyph: glyphFor(product),
}))

/* ── Helpers ───────────────────────────────────────────────── */

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function artHTML(product, extraClass = '') {
  const pal = PALETTES[product.pal] ?? PALETTES[0]
  return `<div class="art ${extraClass}" style="--from:${pal.from};--to:${pal.to};--ink-art:${pal.ink}">
      <svg class="art__fallback" viewBox="0 0 120 120" aria-hidden="true">${GLYPHS[product.glyph] ?? GLYPHS.photo}</svg>
      <img
        class="art__img"
        src="${product.img}"
        alt="${esc(product.name)}"
        loading="lazy"
        decoding="async"
        width="640"
        height="640"
        onerror="this.closest('.art').classList.add('art--fallback'); this.remove()"
      />
    </div>`
}

function money(n) {
  return `$${n.toFixed(2)}`
}

function priceHTML(product) {
  const [whole, frac] = product.price.toFixed(2).split('.')
  const save = product.was ? Math.round(((product.was - product.price) / product.was) * 100) : 0
  return `<div class="price">
      <span class="price__main"><span class="price__cur">$</span><span class="price__whole">${whole}</span><span class="price__frac">${frac}</span></span>
      ${product.was ? `<s>${money(product.was)}</s>` : ''}
      ${save ? `<span class="price__save">-${save}%</span>` : ''}
    </div>`
}

function starsHTML(rating, reviews, { count = true } = {}) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100))
  const short = reviews >= 1000 ? `${(reviews / 1000).toFixed(1).replace('.0', '')}k` : reviews
  return `<div class="stars">
      <span class="stars__glyph" aria-hidden="true">★★★★★<span class="stars__fill" style="width:${pct}%">★★★★★</span></span>
      <b>${rating.toFixed(1)}</b>
      ${count ? `<span>(${short})</span>` : ''}
    </div>`
}

function badgeHTML(badge) {
  if (!badge) return ''
  const cls =
    badge === 'Best Seller'
      ? 'badge--best'
      : badge === 'New'
        ? 'badge--new'
        : badge === 'Trending'
          ? 'badge--trend'
          : badge === 'Deal'
            ? 'badge--deal'
            : ''
  return `<span class="badge ${cls}">${badge === 'Deal' ? 'Limited deal' : badge}</span>`
}

const SHIP_WINDOW = '7–12 days'
const MAX_PRICE = 150

/** Realistic supplier transit window: no warehouse sits behind this store. */
function deliveryWindow() {
  const fmt = (offset) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return `${fmt(7)} – ${fmt(12)}`
}

/* ── State ─────────────────────────────────────────────────── */

const CART_KEY = 'droprush-cart-v2'
const WISH_KEY = 'droprush-wish-v2'
const state = {
  cart: loadCart(),
  wish: loadWish(),
  cat: 'All',
  query: '',
  maxPrice: MAX_PRICE,
  minRating: 0,
  dealsOnly: false,
  fastOnly: false,
  sort: 'featured',
}

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((l) => l && PRODUCTS.some((p) => p.id === l.id) && Number.isFinite(l.qty))
      .map((l) => ({ id: l.id, qty: Math.max(1, Math.min(20, Math.round(l.qty))) }))
  } catch {
    return []
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart))
  } catch {
    /* storage can be unavailable — the cart still works for this visit */
  }
}

function loadWish() {
  try {
    const raw = JSON.parse(localStorage.getItem(WISH_KEY) || '[]')
    return new Set(Array.isArray(raw) ? raw.filter((id) => PRODUCTS.some((p) => p.id === id)) : [])
  } catch {
    return new Set()
  }
}

function saveWish() {
  try {
    localStorage.setItem(WISH_KEY, JSON.stringify([...state.wish]))
  } catch {
    /* non-essential preference */
  }
}

const findProduct = (id) => PRODUCTS.find((p) => p.id === id)
const cartCount = () => state.cart.reduce((n, l) => n + l.qty, 0)
const cartTotal = () =>
  state.cart.reduce((sum, l) => {
    const p = findProduct(l.id)
    return sum + (p ? p.price * l.qty : 0)
  }, 0)

/* ── Toast ─────────────────────────────────────────────────── */

let toastTimer
let toastAction = null

function toast(message, action = null) {
  const el = $('#toast')
  toastAction = action
  el.textContent = message
  if (action) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.id = 'toastAction'
    btn.className = 'toast__action'
    btn.textContent = action.label
    el.appendChild(btn)
  }
  el.classList.add('is-open')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('is-open'), action ? 6000 : 2600)
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#toastAction')) return
  const run = toastAction?.run
  toastAction = null
  $('#toast').classList.remove('is-open')
  if (typeof run === 'function') run()
})

/* ── Hero art ──────────────────────────────────────────────── */

const HERO_PICKS = ['d100', 'd47', 'd51', 'd93']

function paintHeroArt() {
  $$('.float').forEach((el, i) => {
    const product = findProduct(HERO_PICKS[i])
    if (!product) return
    el.innerHTML = `<img class="float__img" src="${product.img}" alt="" loading="eager" decoding="async" />`
  })
}

/* ── Promo cards ───────────────────────────────────────────── */

const PROMOS = [
  {
    title: 'Trending this week',
    link: 'See the full trend list',
    cat: 'All',
    ids: ['d100', 'd51', 'd1', 'd140'],
  },
  {
    title: 'Home upgrades under $50',
    link: 'Shop home',
    cat: 'Home & Kitchen',
    ids: ['d47', 'd44', 'd73', 'd46'],
  },
  {
    title: 'Move more, spend less',
    link: 'Shop fitness',
    cat: 'Fitness',
    ids: ['d140', 'd137', 'd152', 'd150'],
  },
  {
    title: 'Gadgets that sell out',
    link: 'Shop tech',
    cat: 'Tech & Gadgets',
    ids: ['d100', 'd107', 'd102', 'd103'],
  },
]

function renderPromos() {
  $('#promoGrid').innerHTML = PROMOS.map(
    (promo) => `<div class="promo">
      <h3>${promo.title}</h3>
      <div class="promo__tiles">
        ${promo.ids
          .map((id) => {
            const p = findProduct(id)
            if (!p) return ''
            return `<button class="promo__tile" data-open="${p.id}">
              ${artHTML(p)}
              <span>${esc(p.name)}</span>
            </button>`
          })
          .join('')}
      </div>
      <button class="promo__link" data-cat-jump="${promo.cat}">${promo.link}</button>
    </div>`
  ).join('')
}

/* ── Deals ─────────────────────────────────────────────────── */

function renderDeals() {
  const deals = PRODUCTS.filter((p) => p.was)
    .sort((a, b) => b.was / b.price - a.was / a.price)
    .slice(0, 10)

  $('#dealsRail').innerHTML = deals
    .map((p) => {
      const off = Math.round(((p.was - p.price) / p.was) * 100)
      return `<button class="deal" data-open="${p.id}">
        <div style="position:relative">
          ${artHTML(p)}
          <span class="deal__off">-${off}%</span>
        </div>
        <span class="deal__name">${esc(p.name)}</span>
        <span class="deal__price"><b>${money(p.price)}</b><s>${money(p.was)}</s></span>
        <span class="stars" style="gap:4px">
          <span class="stars__glyph" aria-hidden="true">★★★★★<span class="stars__fill" style="width:${(p.rating / 5) * 100}%">★★★★★</span></span>
          <span style="font-size:11px">(${(p.reviews / 1000).toFixed(1)}k)</span>
        </span>
      </button>`
    })
    .join('')
}

function startDealClock() {
  const el = $('#dealTimer')
  const tick = () => {
    const now = new Date()
    const end = new Date(now)
    end.setHours(24, 0, 0, 0)
    const diff = Math.max(0, end - now)
    const h = String(Math.floor(diff / 3.6e6)).padStart(2, '0')
    const m = String(Math.floor((diff % 3.6e6) / 6e4)).padStart(2, '0')
    const s = String(Math.floor((diff % 6e4) / 1000)).padStart(2, '0')
    el.textContent = `Ends in ${h}:${m}:${s}`
  }
  tick()
  setInterval(tick, 1000)
}

/* ── Filters ───────────────────────────────────────────────── */

const CATEGORIES = ['All', ...new Set(PRODUCTS.map((p) => p.cat))]

function renderCategories() {
  $('#categoryList').innerHTML = CATEGORIES.map((cat) => {
    const count = cat === 'All' ? PRODUCTS.length : PRODUCTS.filter((p) => p.cat === cat).length
    return `<li><button data-cat="${cat}" class="${state.cat === cat ? 'is-active' : ''}" aria-pressed="${state.cat === cat}">${cat}<span>${count}</span></button></li>`
  }).join('')
}

function activeFilters() {
  const list = []
  if (state.cat !== 'All') list.push({ key: 'cat', label: state.cat })
  if (state.query) list.push({ key: 'query', label: `“${state.query}”` })
  if (state.minRating > 0) list.push({ key: 'rating', label: `${state.minRating}★ & up` })
  if (state.maxPrice < MAX_PRICE) list.push({ key: 'price', label: `Up to $${state.maxPrice}` })
  if (state.dealsOnly) list.push({ key: 'deals', label: 'On sale' })
  if (state.fastOnly) list.push({ key: 'fast', label: 'Ships in 24h' })
  return list
}

function renderApplied() {
  const wrap = $('#appliedFilters')
  const toggleCount = $('#filterCount')
  const list = activeFilters()

  if (toggleCount) {
    toggleCount.textContent = list.length
    toggleCount.hidden = list.length === 0
  }

  if (!list.length) {
    wrap.hidden = true
    wrap.innerHTML = ''
    return
  }

  wrap.hidden = false
  wrap.innerHTML =
    '<span class="applied__label">Filtered by</span>' +
    list
      .map(
        (f) => `<button class="chip" data-clear-filter="${f.key}" aria-label="Remove filter ${esc(f.label)}">
          ${esc(f.label)}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>`
      )
      .join('') +
    (list.length > 1 ? '<button class="applied__clear" data-clear-filter="all">Clear all</button>' : '')
}

function resetFilters() {
  state.cat = 'All'
  state.query = ''
  state.maxPrice = MAX_PRICE
  state.minRating = 0
  state.dealsOnly = false
  state.fastOnly = false
  $('#searchInput').value = ''
  $('#searchScope').value = 'All'
  syncSearchClear()
  update({ categories: true })
}

function clearFilter(key) {
  if (key === 'all') {
    resetFilters()
    return
  }
  if (key === 'cat') state.cat = 'All'
  if (key === 'query') {
    state.query = ''
    $('#searchInput').value = ''
    syncSearchClear()
  }
  if (key === 'rating') state.minRating = 0
  if (key === 'price') state.maxPrice = MAX_PRICE
  if (key === 'deals') state.dealsOnly = false
  if (key === 'fast') state.fastOnly = false
  update({ categories: true })
}

function matches(p) {
  if (state.cat !== 'All' && p.cat !== state.cat) return false
  if (p.price > state.maxPrice) return false
  if (p.rating < state.minRating) return false
  if (state.dealsOnly && !p.was) return false
  if (state.fastOnly && p.qps > 3) return false
  if (state.query) {
    const q = state.query.toLowerCase()
    const hay = `${p.name} ${p.cat} ${p.blurb} ${p.supplier}`.toLowerCase()
    if (!q.split(/\s+/).every((word) => hay.includes(word))) return false
  }
  return true
}

function sortProducts(list) {
  const sorted = [...list]
  switch (state.sort) {
    case 'price-asc':
      return sorted.sort((a, b) => a.price - b.price)
    case 'price-desc':
      return sorted.sort((a, b) => b.price - a.price)
    case 'rating':
      return sorted.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
    case 'reviews':
      return sorted.sort((a, b) => b.reviews - a.reviews)
    default:
      return sorted.sort(
        (a, b) => b.rating * Math.log(b.reviews + 1) - a.rating * Math.log(a.reviews + 1)
      )
  }
}

function cardHTML(p, { reason = '', extra = '' } = {}) {
  const fast = p.qps <= 3
  return `<article class="card">
      <button class="wish ${state.wish.has(p.id) ? 'is-on' : ''}" data-wish="${p.id}" aria-label="Save ${esc(p.name)}" aria-pressed="${state.wish.has(p.id)}">
        <svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.7-7.5-10a4.3 4.3 0 0 1 7.5-2.8A4.3 4.3 0 0 1 19.5 10c0 5.3-7.5 10-7.5 10z"/></svg>
      </button>
      ${badgeHTML(p.badge)}
      <button class="card__art-btn" data-open="${p.id}" aria-label="View ${esc(p.name)}">
        ${artHTML(p)}
      </button>
      <h3 class="card__head"><button class="card__name" data-open="${p.id}">${esc(p.name)}</button></h3>
      ${reason ? `<p class="card__reason">${esc(reason)}</p>` : ''}
      ${starsHTML(p.rating, p.reviews)}
      ${priceHTML(p)}
      <p class="ship">
        <span class="fast">${fast ? 'Ships in 24h' : 'Ships in 48h'}</span> · arrives <b>${deliveryWindow()}</b>
      </p>
      <p class="sold">${esc(p.sold)}</p>
      <div class="card__actions">
        <button class="add" data-add="${p.id}">Add to cart</button>
        <button class="view" data-open="${p.id}" aria-label="Quick view">
          <svg viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>
        </button>
      </div>
      ${extra}
    </article>`
}

function renderResults() {
  const list = sortProducts(PRODUCTS.filter(matches))
  const grid = $('#productGrid')
  grid.innerHTML = list.map(cardHTML).join('')
  $('#emptyState').hidden = list.length > 0
  $('#resultCount').textContent =
    list.length === 0
      ? 'No results'
      : `${list.length} result${list.length === 1 ? '' : 's'}${state.query ? ` for “${state.query}”` : ''}`

  const heading = state.cat === 'All' ? 'Trending across Droprush' : state.cat
  $('#resultsHeading').textContent = state.query ? `Results for “${state.query}”` : heading
}

function syncControls() {
  $$('#categoryList button').forEach((b) => {
    const active = b.dataset.cat === state.cat
    b.classList.toggle('is-active', active)
    b.setAttribute('aria-pressed', String(active))
  })
  $$('#ratingList button').forEach((b) => {
    const active = Number(b.dataset.rating) === state.minRating
    b.classList.toggle('is-active', active)
    b.setAttribute('aria-pressed', String(active))
  })
  const range = $('#priceRange')
  range.value = state.maxPrice
  range.setAttribute('aria-valuetext', `Up to $${state.maxPrice}`)
  $('#priceLabel').textContent = `$${state.maxPrice}`
  $('#dealsOnly').checked = state.dealsOnly
  $('#fastOnly').checked = state.fastOnly
  $('#sortSelect').value = state.sort

  const scope = $('#searchScope')
  if (scope && [...scope.options].some((o) => o.value === state.cat)) scope.value = state.cat
}

function update({ categories = false } = {}) {
  if (categories) renderCategories()
  syncControls()
  renderResults()
  renderApplied()
}

function syncSearchClear() {
  const input = $('#searchInput')
  const btn = $('#searchClear')
  if (input && btn) btn.hidden = input.value.length === 0
}

function syncHeaderHeight() {
  const header = $('.topbar')
  if (!header) return
  const apply = () => {
    document.documentElement.style.setProperty(
      '--header-h',
      `${Math.round(header.getBoundingClientRect().height)}px`
    )
  }
  apply()
  if ('ResizeObserver' in window) new ResizeObserver(apply).observe(header)
  window.addEventListener('resize', apply)
  window.addEventListener('load', apply)
}

/* ── Cart ──────────────────────────────────────────────────── */

function addToCart(id, qty = 1, { silent = false } = {}) {
  const line = state.cart.find((l) => l.id === id)
  if (line) line.qty = Math.min(20, line.qty + qty)
  else state.cart.push({ id, qty })
  saveCart()
  renderCart(true)
  if (!silent) {
    const p = findProduct(id)
    toast(`${p.name} added to cart`)
  }
}

function setQty(id, qty) {
  const line = state.cart.find((l) => l.id === id)
  if (!line) return
  if (qty <= 0) state.cart = state.cart.filter((l) => l.id !== id)
  else line.qty = Math.min(20, qty)
  saveCart()
  renderCart()
}

function renderCart(pop = false) {
  const items = $('#cartItems')
  const count = cartCount()
  const total = cartTotal()

  const badge = $('#cartCount')
  badge.textContent = count
  $('#cartBtn').setAttribute('aria-label', `Open cart, ${count} item${count === 1 ? '' : 's'}`)
  const status = $('#cartStatus')
  if (status) {
    status.textContent =
      count === 0
        ? 'Cart is empty'
        : `Cart updated: ${count} item${count === 1 ? '' : 's'}, subtotal ${money(total)}`
  }
  if (pop) {
    badge.classList.add('pop')
    setTimeout(() => badge.classList.remove('pop'), 220)
  }

  items.innerHTML = state.cart
    .map((line) => {
      const p = findProduct(line.id)
      if (!p) return ''
      return `<div class="cart-item">
        ${artHTML(p)}
        <div>
          <div class="cart-item__name">${esc(p.name)}</div>
          <div class="cart-item__price">${money(p.price * line.qty)}</div>
          <div class="cart-item__meta">${SHIP_WINDOW} · tracked</div>
          <div class="qty">
            <button data-qty="${p.id}" data-delta="-1" aria-label="Decrease quantity">−</button>
            <span>${line.qty}</span>
            <button data-qty="${p.id}" data-delta="1" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <button class="cart-item__remove" data-remove="${p.id}">Remove</button>
      </div>`
    })
    .join('')

  const empty = count === 0
  $('#cartEmpty').style.display = empty ? 'block' : 'none'
  items.style.display = empty ? 'none' : 'block'

  $('#cartSubtotal').textContent = money(total)
  $('#cartShipping').textContent = empty ? '—' : total >= 35 ? 'Free' : money(4.9)

  const remaining = Math.max(0, 35 - total)
  $('#shipText').innerHTML = empty
    ? 'Free shipping on orders over <b>$35</b>'
    : remaining > 0
      ? `Add ${money(remaining)} more for <b>free shipping</b>`
      : '🎉 <b>Free shipping unlocked</b>'
  $('#shipBar').style.width = `${Math.min(100, (total / 35) * 100)}%`

  $('#checkoutBtn').disabled = empty
  $('#checkoutBtn').style.opacity = empty ? '0.5' : '1'
}

let lastFocused = null

function rememberFocus() {
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
}

function restoreFocus() {
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus({ preventScroll: true })
  lastFocused = null
}

function trapFocus(e, container, extras = []) {
  if (!container || e.key !== 'Tab') return
  const selector =
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  const roots = [container, ...extras.filter(Boolean)]
  const nodes = roots
    .flatMap((root) => [...root.querySelectorAll(selector)])
    .filter((el) => el.offsetParent !== null)
  if (!nodes.length) return
  const first = nodes[0]
  const last = nodes[nodes.length - 1]

  // If focus is outside the dialog and its extras (or on the container), pull it back in.
  if (!roots.some((root) => root.contains(document.activeElement))) {
    e.preventDefault()
    first.focus()
    return
  }

  const onContainer = document.activeElement === container
  if (e.shiftKey && (document.activeElement === first || onContainer)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

function openCart() {
  const drawer = $('#cartDrawer')
  if (drawer.classList.contains('is-open')) return
  rememberFocus()
  drawer.classList.add('is-open')
  drawer.setAttribute('aria-hidden', 'false')
  $('#cartBtn').setAttribute('aria-expanded', 'true')
  $('#overlay').classList.add('is-open')
  document.body.classList.add('no-scroll')
  drawer.focus({ preventScroll: true })
}

function closeCart() {
  const drawer = $('#cartDrawer')
  if (!drawer.classList.contains('is-open')) return
  drawer.classList.remove('is-open')
  drawer.setAttribute('aria-hidden', 'true')
  $('#cartBtn').setAttribute('aria-expanded', 'false')
  $('#overlay').classList.remove('is-open')
  document.body.classList.remove('no-scroll')
  restoreFocus()
}

/* ── Checkout shipping ─────────────────────────────────────── */

function openCheckout() {
  if (cartCount() === 0) return
  closeCart()
  const modal = $('#checkoutModal')
  const form = $('#checkoutForm')
  if (!modal || !form) return
  rememberFocus()

  form.reset()
  const setValue = (name, value) => {
    const control = form.elements.namedItem(name)
    if (control) control.value = value
  }
  setValue('name', currentUser?.name || '')
  setValue('email', currentUser?.email || '')

  const total = cartTotal()
  const shipping = total >= 35 ? 0 : 4.9
  $('#checkoutSummary').textContent = `${cartCount()} item${cartCount() === 1 ? '' : 's'} · ${money(total + shipping)} with shipping`
  $('#checkoutSubmit').textContent = `Continue to payment · ${money(total + shipping)}`
  $('#checkoutError').hidden = true

  modal.classList.add('is-open')
  modal.setAttribute('aria-hidden', 'false')
  document.body.classList.add('no-scroll')
  const nameInput = form.elements.namedItem('name')
  const focusFirst = () => {
    if (modal.classList.contains('is-open')) nameInput?.focus({ preventScroll: true })
  }
  requestAnimationFrame(focusFirst)
  setTimeout(focusFirst, 260)
}

function closeCheckout() {
  const modal = $('#checkoutModal')
  if (!modal.classList.contains('is-open')) return
  modal.classList.remove('is-open')
  modal.setAttribute('aria-hidden', 'true')
  if (
    !$('#authModal').classList.contains('is-open') &&
    !$('#modal').classList.contains('is-open') &&
    !$('#cartDrawer').classList.contains('is-open')
  ) {
    document.body.classList.remove('no-scroll')
  }
  restoreFocus()
}

async function submitCheckout(event) {
  event.preventDefault()
  const form = event.currentTarget
  if (!form.reportValidity()) return
  const data = new FormData(form)
  const shipping = {
    name: String(data.get('name') || '').trim(),
    phone: String(data.get('phone') || '').trim(),
    line1: String(data.get('line1') || '').trim(),
    line2: String(data.get('line2') || '').trim(),
    city: String(data.get('city') || '').trim(),
    region: String(data.get('region') || '').trim(),
    postal: String(data.get('postal') || '').trim(),
    country: String(data.get('country') || '').trim(),
  }
  const email = String(data.get('email') || '').trim()
  const errorBox = $('#checkoutError')
  const button = $('#checkoutSubmit')
  const label = button.textContent
  errorBox.hidden = true
  button.disabled = true
  button.textContent = 'Starting checkout…'

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: state.cart, email, shipping }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.url) throw new Error(body.error || 'Checkout is unavailable right now.')
    window.location.assign(body.url)
  } catch (error) {
    errorBox.textContent = error.message
    errorBox.hidden = false
    button.disabled = false
    button.textContent = label
  }
}

/* ── Modal ─────────────────────────────────────────────────── */

function openProduct(id) {
  const p = findProduct(id)
  if (!p) return
  const discount = p.was ? `-${Math.round(((p.was - p.price) / p.was) * 100)}%` : ''
  $('#modalBody').innerHTML = `<div class="modal__grid">
    <div>${artHTML(p)}</div>
    <div>
      <div class="modal__cat">${esc(p.cat)}</div>
      <h2 class="modal__title">${esc(p.name)}</h2>
      <div class="modal__rating">
        ${starsHTML(p.rating, p.reviews, { count: false })}
        <span>· ${p.reviews.toLocaleString()} reviews</span>
      </div>
      ${priceHTML(p)}
      <p class="modal__blurb">${esc(p.blurb)}</p>
      <div class="modal__rows">
        <div class="modal__row"><span>Supplier</span><b>${esc(p.supplier)}</b></div>
        <div class="modal__row"><span>Handling</span><b>${p.qps <= 3 ? 'Within 24 hours' : 'Within 48 hours'}</b></div>
        <div class="modal__row"><span>Delivery</span><b>${SHIP_WINDOW} · tracked (${deliveryWindow()})</b></div>
        <div class="modal__row"><span>Orders</span><b>${esc(p.sold)}</b></div>
        <div class="modal__row"><span>Seller rating</span><b>${(p.rating + 0.2).toFixed(1)}★ · verified</b></div>
      </div>
      <p class="stock">Only ${p.stock} left at this price ${discount}</p>
      <div class="modal__buy">
        <button class="btn btn--primary" data-add="${p.id}">Add to cart · ${money(p.price)}</button>
        <button class="btn btn--soft" data-open-cart="1">View cart</button>
      </div>
      <div class="modal__trust">
        <span><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg> 30-day returns</span>
        <span><svg viewBox="0 0 24 24"><path d="M2 7h11v9H2zM13 10h5l3 3v3h-8z"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/></svg> Free over $35</span>
        <span><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg> Buyer protection</span>
      </div>
      <p class="modal__note">Ships direct from the supplier. Transit is 7–12 days and can stretch a few days at customs.</p>
    </div>
  </div>`
  rememberFocus()
  $('#modal').classList.add('is-open')
  $('#modal').setAttribute('aria-hidden', 'false')
  document.body.classList.add('no-scroll')
  // The panel is revealed by a visibility transition, so focus it only once it
  // is actually focusable — first frame, then after the 220ms transition.
  const panel = $('#modal .modal__panel')
  const focusPanel = () => panel.focus({ preventScroll: true })
  requestAnimationFrame(focusPanel)
  setTimeout(focusPanel, 260)
}

function closeModal() {
  const modal = $('#modal')
  if (!modal.classList.contains('is-open')) return
  modal.classList.remove('is-open')
  modal.setAttribute('aria-hidden', 'true')
  if (!$('#cartDrawer').classList.contains('is-open')) {
    document.body.classList.remove('no-scroll')
    restoreFocus()
  }
}

/* ── Account, For You, Want to buy ─────────────────────────── */

let currentUser = null
let currentView = 'shop'
let authMode = 'signin'
let forYouData = null
let forYouLoading = false

const viewFromHash = () => {
  const hash = location.hash.replace('#', '')
  return hash === 'for-you' || hash === 'wants' ? hash : 'shop'
}

function applyView(view, { scroll = true, push = false } = {}) {
  const next = ['shop', 'for-you', 'wants'].includes(view) ? view : 'shop'
  currentView = next
  $('#storeView').hidden = next !== 'shop'
  $('#forYouView').hidden = next !== 'for-you'
  $('#wantsView').hidden = next !== 'wants'

  $$('.subnav__link[data-view]').forEach((link) => {
    const active = link.dataset.view === next
    link.classList.toggle('is-active', active)
    if (active) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })

  document.title =
    next === 'for-you'
      ? 'For you · DROPRUSH'
      : next === 'wants'
        ? 'Want to buy · DROPRUSH'
        : 'DROPRUSH — Trending products, shipped direct'

  if (next === 'for-you') loadForYou()
  if (next === 'wants') renderWants()
  if (scroll) window.scrollTo({ top: 0, behavior: 'auto' })
  if (push) history.pushState(null, '', next === 'shop' ? '#shop' : `#${next}`)
}

function updateWantsCount() {
  const badge = $('#wantsNavCount')
  if (!badge) return
  const count = state.wish.size
  badge.textContent = count
  badge.hidden = count === 0
  const link = $('.subnav__link[data-view="wants"]')
  if (link) link.setAttribute('aria-label', `Want to buy, ${count} item${count === 1 ? '' : 's'}`)
}

function syncWishButtons() {
  $$('[data-wish]').forEach((button) => {
    const on = state.wish.has(button.dataset.wish)
    button.classList.toggle('is-on', on)
    button.setAttribute('aria-pressed', String(on))
  })
}

function setWish(id, active) {
  const product = findProduct(id)
  if (!product) return
  if (active) state.wish.add(id)
  else state.wish.delete(id)
  saveWish()
  updateWantsCount()
  syncWishButtons()
  if (currentView === 'wants') renderWants()
  if (currentView === 'for-you') renderForYou()

  toast(
    active ? `${product.name} saved to Want to buy` : 'Removed from Want to buy',
    active && !currentUser ? { label: 'Sign in', run: () => openAuth('signin') } : null
  )

  if (!currentUser) return
  fetch(active ? '/api/wants' : `/api/wants/${encodeURIComponent(id)}`, {
    method: active ? 'POST' : 'DELETE',
    headers: active ? { 'content-type': 'application/json' } : undefined,
    body: active ? JSON.stringify({ id }) : undefined,
  }).catch(() => {
    toast('Saved on this device — sync will retry when the connection is back.')
  })
}

function renderWants() {
  const grid = $('#wantsGrid')
  if (!grid) return
  const list = [...state.wish].map(findProduct).filter(Boolean)
  grid.innerHTML = list
    .map((p) =>
      cardHTML(p, {
        reason: 'In your want list',
        extra: `<button class="card__want-move" data-move-want="${p.id}">Move to cart · ${money(p.price)}</button>`,
      })
    )
    .join('')
  grid.hidden = list.length === 0
  $('#wantsEmpty').hidden = list.length > 0
  $('#wantsSignIn').hidden = Boolean(currentUser)
  $('#wantsSub').textContent = list.length
    ? `${list.length} item${list.length === 1 ? '' : 's'} saved ${currentUser ? 'to your account' : 'on this device'}. Move them to the cart when you're ready.`
    : "Save anything with the heart, then move it to your cart when you're ready."
}

function fallbackForYou() {
  const wishCats = {}
  for (const id of state.wish) {
    const product = findProduct(id)
    if (product) wishCats[product.cat] = (wishCats[product.cat] || 0) + 1
  }
  const sorted = [...PRODUCTS]
    .filter((p) => !state.wish.has(p.id))
    .sort((a, b) => b.rating * Math.log(b.reviews + 1) - a.rating * Math.log(a.reviews + 1))
  const items = []
  const perCat = {}
  for (const product of sorted) {
    if ((perCat[product.cat] || 0) >= 3) continue
    perCat[product.cat] = (perCat[product.cat] || 0) + 1
    items.push({
      id: product.id,
      reason: wishCats[product.cat] ? `More ${product.cat} you saved` : `Popular in ${product.cat}`,
    })
    if (items.length === 12) break
  }
  return {
    personalized: false,
    wants: state.wish.size,
    orders: 0,
    topCategories: Object.keys(wishCats),
    items,
    fallback: true,
  }
}

async function loadForYou(force = false) {
  if (forYouLoading) return
  if (forYouData && !force) {
    renderForYou()
    return
  }
  forYouLoading = true
  try {
    const res = await fetch('/api/for-you', { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    forYouData = await res.json()
    $('#forYouNote').textContent = ''
  } catch {
    forYouData = fallbackForYou()
    $('#forYouNote').textContent = 'Personalization is offline — showing trending picks instead.'
  } finally {
    forYouLoading = false
  }
  renderForYou()
}

function renderForYou() {
  if (!forYouData) return
  const data = forYouData
  const cartIds = new Set(state.cart.map((line) => line.id))
  const items = data.items
    .map((item) => ({ product: findProduct(item.id), reason: item.reason }))
    .filter(({ product }) => product && !cartIds.has(product.id) && !state.wish.has(product.id))

  $('#forYouGrid').innerHTML = items
    .map(({ product, reason }) => cardHTML(product, { reason }))
    .join('')
  $('#forYouGrid').hidden = items.length === 0
  $('#forYouEmpty').hidden = items.length > 0

  const firstName = currentUser?.name?.split(/\s+/)[0]
  $('#forYouTitle').textContent = firstName ? `For you, ${firstName}` : 'For you'
  $('#forYouSub').textContent = data.personalized
    ? 'Scored from your saves and orders, then spread across departments so the page does not repeat one category.'
    : 'Sign in to build a feed from what you save and buy. Until then, these are the strongest sellers across the store.'

  const signals = $('#forYouSignals')
  if (!currentUser) {
    signals.innerHTML =
      '<button class="feed__signin" data-auth-open="signin">Sign in to personalize this page</button>'
    return
  }
  const chips = [
    `<span class="feed__signal"><b>${data.wants}</b> saved</span>`,
    `<span class="feed__signal"><b>${data.orders}</b> order${data.orders === 1 ? '' : 's'}</span>`,
  ]
  if (data.topCategories?.length) {
    chips.push(`<span class="feed__signal">Top: <b>${esc(data.topCategories.join(' · '))}</b></span>`)
  }
  chips.push(`<span class="feed__signal"><b>${cartCount()}</b> in cart</span>`)
  signals.innerHTML = chips.join('')
}

function renderAccount() {
  const button = $('#accountBtn')
  if (!button) return
  $('#accountHello').textContent = currentUser
    ? `Hello, ${currentUser.name.split(/\s+/)[0]}`
    : 'Hello, sign in'
  $('#accountLabel').textContent = currentUser ? 'Account' : 'Sign in'
  button.classList.toggle('is-signed-in', Boolean(currentUser))
  button.setAttribute(
    'aria-label',
    currentUser ? `Account for ${currentUser.name}` : 'Sign in or create an account'
  )
  updateWantsCount()
}

async function refreshSession() {
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' })
    const data = await res.json()
    currentUser = data.user || null
  } catch {
    currentUser = null
  }
  renderAccount()
  if (currentUser) await syncWants()
  if (currentView === 'for-you') loadForYou(true)
  if (currentView === 'wants') renderWants()
}

async function syncWants() {
  try {
    const res = await fetch('/api/wants', { cache: 'no-store' })
    if (!res.ok) return
    const { ids } = await res.json()
    const merged = new Set(ids)
    for (const id of [...state.wish]) {
      if (merged.has(id)) continue
      merged.add(id)
      await fetch('/api/wants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    }
    state.wish = merged
    saveWish()
    updateWantsCount()
    syncWishButtons()
  } catch {
    /* offline: the local list still works */
  }
}

function openAuth(mode = 'signin') {
  authMode = currentUser ? 'account' : mode
  rememberFocus()
  const modal = $('#authModal')
  modal.classList.add('is-open')
  modal.setAttribute('aria-hidden', 'false')
  $('#accountBtn').setAttribute('aria-expanded', 'true')
  document.body.classList.add('no-scroll')
  renderAuth()
  const panel = $('#authModal .modal__panel')
  const focusPanel = () => panel.focus({ preventScroll: true })
  requestAnimationFrame(focusPanel)
  setTimeout(focusPanel, 260)
}

function closeAuth() {
  const modal = $('#authModal')
  if (!modal.classList.contains('is-open')) return
  modal.classList.remove('is-open')
  modal.setAttribute('aria-hidden', 'true')
  $('#accountBtn').setAttribute('aria-expanded', 'false')
  if (!$('#modal').classList.contains('is-open') && !$('#cartDrawer').classList.contains('is-open')) {
    document.body.classList.remove('no-scroll')
  }
  restoreFocus()
}

function orderHTML(order) {
  const label =
    order.status === 'paid'
      ? 'Paid'
      : order.status === 'test'
        ? 'Test order'
        : order.status === 'payment_failed'
          ? 'Failed'
          : 'Pending'
  const date = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `<a class="auth__order" href="/confirmation.html?ref=${encodeURIComponent(order.ref)}">
      <span>
        <span class="auth__order-ref">${esc(order.ref)}</span><br />
        <span class="auth__order-meta">${esc(date)} · ${order.items} item${order.items === 1 ? '' : 's'}</span>
      </span>
      <span>
        <span class="auth__order-total">${money(order.total)}</span><br />
        <span class="auth__order-status ${order.status === 'paid' ? 'is-paid' : ''}">${label}</span>
      </span>
    </a>`
}

async function loadOrders() {
  const box = $('#authOrders')
  if (!box) return
  try {
    const res = await fetch('/api/orders', { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { orders } = await res.json()
    box.innerHTML = orders.length
      ? orders.map(orderHTML).join('')
      : '<p class="auth__muted">No orders yet. Your next checkout will appear here.</p>'
  } catch {
    box.innerHTML = '<p class="auth__muted">Could not load orders right now.</p>'
  }
}

function renderAuth() {
  const body = $('#authBody')
  if (!body) return

  if (currentUser) {
    body.innerHTML = `<p class="auth__eyebrow">Signed in</p>
      <h2 id="authTitle">Hi, ${esc(currentUser.name)}</h2>
      <p class="auth__email">${esc(currentUser.email)}</p>
      <div class="auth__links">
        <button class="btn btn--primary btn--block" data-view="for-you">Open your For you page</button>
        <button class="btn btn--soft btn--block" data-view="wants">Want to buy · ${state.wish.size}</button>
      </div>
      <h3 class="auth__h3">Recent orders</h3>
      <div class="auth__orders" id="authOrders"><p class="auth__muted">Loading orders…</p></div>
      <button class="auth__signout" id="signOutBtn" type="button">Sign out</button>`
    loadOrders()
    $('#signOutBtn')?.addEventListener('click', signOut)
    return
  }

  const signup = authMode === 'signup'
  body.innerHTML = `<p class="auth__eyebrow">${signup ? 'Join Droprush' : 'Welcome back'}</p>
    <h2 id="authTitle">${signup ? 'Create your account' : 'Sign in'}</h2>
    <p class="auth__lede">${
      signup
        ? 'Save products to your want list, get a For you page built from your activity, and keep your orders in one place.'
        : 'Sign in to sync your want list, see your orders and personalize your For you page.'
    }</p>
    <form class="auth__form" id="authForm" novalidate>
      ${
        signup
          ? '<label>Name<input name="name" autocomplete="name" maxlength="60" required /></label>'
          : ''
      }
      <label>Email<input name="email" type="email" autocomplete="email" maxlength="200" required /></label>
      <label>Password<input name="password" type="password" minlength="8" autocomplete="${
        signup ? 'new-password' : 'current-password'
      }" required /></label>
      <p class="auth__error" id="authError" role="alert" hidden></p>
      <button class="btn btn--primary btn--block" type="submit">${signup ? 'Create account' : 'Sign in'}</button>
    </form>
    <p class="auth__switch">${
      signup ? 'Already have an account?' : 'New to Droprush?'
    } <button type="button" id="authSwitch">${signup ? 'Sign in' : 'Create an account'}</button></p>
    <p class="auth__fine">Passwords are hashed with scrypt and sessions are stored in an httpOnly cookie.</p>`

  $('#authForm')?.addEventListener('submit', submitAuth)
  $('#authSwitch')?.addEventListener('click', () => {
    authMode = signup ? 'signin' : 'signup'
    renderAuth()
    $('#authForm input')?.focus()
  })
}

async function submitAuth(event) {
  event.preventDefault()
  const form = event.currentTarget
  const data = new FormData(form)
  const errorBox = $('#authError')
  const button = form.querySelector('button[type="submit"]')
  const label = button.textContent
  errorBox.hidden = true
  button.disabled = true
  button.textContent = 'Please wait…'

  const payload = { email: data.get('email'), password: data.get('password') }
  if (authMode === 'signup') payload.name = data.get('name')

  try {
    const res = await fetch(`/api/auth/${authMode === 'signup' ? 'signup' : 'login'}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || 'Something went wrong. Try again.')
    currentUser = body.user
    renderAccount()
    closeAuth()
    await syncWants()
    if (currentView === 'for-you') loadForYou(true)
    if (currentView === 'wants') renderWants()
    toast(`${authMode === 'signup' ? 'Account created' : 'Signed in'} — welcome, ${currentUser.name.split(/\s+/)[0]}`)
  } catch (error) {
    errorBox.textContent = error.message
    errorBox.hidden = false
    button.disabled = false
    button.textContent = label
  }
}

async function signOut() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } catch {
    /* the local session will expire server-side */
  }
  currentUser = null
  forYouData = null
  state.wish = new Set()
  saveWish()
  updateWantsCount()
  syncWishButtons()
  renderAccount()
  renderAuth()
  if (currentView === 'for-you') loadForYou(true)
  if (currentView === 'wants') renderWants()
  toast('Signed out')
}

/* ── Wiring ────────────────────────────────────────────────── */

document.addEventListener('click', (e) => {
  const viewLink = e.target.closest('[data-view]')
  if (viewLink) {
    e.preventDefault()
    closeAuth()
    applyView(viewLink.dataset.view, { push: true })
    return
  }

  const authOpen = e.target.closest('[data-auth-open]')
  if (authOpen) {
    openAuth(authOpen.dataset.authOpen || 'signin')
    return
  }

  const moveWant = e.target.closest('[data-move-want]')
  if (moveWant) {
    const id = moveWant.dataset.moveWant
    addToCart(id)
    setWish(id, false)
    renderWants()
    toast('Moved to your cart')
    return
  }

  const openBtn = e.target.closest('[data-open]')
  if (openBtn) {
    openProduct(openBtn.dataset.open)
    return
  }

  const addBtn = e.target.closest('[data-add]')
  if (addBtn) {
    addToCart(addBtn.dataset.add)
    closeModal()
    openCart()
    return
  }

  const wishBtn = e.target.closest('[data-wish]')
  if (wishBtn) {
    const id = wishBtn.dataset.wish
    setWish(id, !state.wish.has(id))
    return
  }

  const clearChip = e.target.closest('[data-clear-filter]')
  if (clearChip) {
    clearFilter(clearChip.dataset.clearFilter)
    return
  }

  const qtyBtn = e.target.closest('[data-qty]')
  if (qtyBtn) {
    const line = state.cart.find((l) => l.id === qtyBtn.dataset.qty)
    if (line) setQty(line.id, line.qty + Number(qtyBtn.dataset.delta))
    return
  }

  const removeBtn = e.target.closest('[data-remove]')
  if (removeBtn) {
    const id = removeBtn.dataset.remove
    const line = state.cart.find((l) => l.id === id)
    const product = findProduct(id)
    if (!line || !product) return
    const removed = { id, qty: line.qty }
    setQty(id, 0)
    toast(`${product.name} removed`, {
      label: 'Undo',
      run: () => {
        state.cart.push(removed)
        saveCart()
        renderCart(true)
        $('#cartDrawer').focus({ preventScroll: true })
        toast('Item restored')
      },
    })
    return
  }

  const openCartBtn = e.target.closest('[data-open-cart]')
  if (openCartBtn) {
    closeModal()
    openCart()
    return
  }

  const toastBtn = e.target.closest('[data-toast]')
  if (toastBtn) {
    toast(toastBtn.dataset.toast)
    return
  }

  const catJump = e.target.closest('[data-cat-jump]')
  if (catJump) {
    applyView('shop', { scroll: false })
    state.cat = catJump.dataset.catJump
    update({ categories: true })
    $('#shop').scrollIntoView({ behavior: 'smooth' })
    return
  }

  const catBtn = e.target.closest('[data-cat]')
  if (catBtn) {
    applyView('shop', { scroll: false })
    state.cat = catBtn.dataset.cat.replace(/&amp;/g, '&')
    state.query = ''
    $('#searchInput').value = ''
    syncSearchClear()
    update({ categories: true })
    $('#shop').scrollIntoView({ behavior: 'smooth' })
    return
  }

  const ratingBtn = e.target.closest('[data-rating]')
  if (ratingBtn) {
    state.minRating = Number(ratingBtn.dataset.rating)
    update()
    return
  }

  if (e.target.closest('#accountBtn')) {
    openAuth(currentUser ? 'account' : 'signin')
    return
  }
  if (e.target.closest('#ordersBtn')) {
    openAuth(currentUser ? 'account' : 'signin')
    if (!currentUser) toast('Sign in to see your orders.')
    return
  }
  if (e.target.closest('#checkoutClose') || e.target.id === 'checkoutModal') {
    closeCheckout()
    return
  }
  if (e.target.closest('#authClose') || e.target.id === 'authModal') {
    closeAuth()
    return
  }
  if (e.target.closest('#cartBtn')) {
    openCart()
    return
  }
  if (e.target.closest('#cartClose') || e.target.id === 'overlay') {
    closeCart()
    return
  }
  if (e.target.closest('#modalClose')) {
    closeModal()
    return
  }
  if (e.target.id === 'modal') {
    closeModal()
    return
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('#checkoutModal').classList.contains('is-open')) closeCheckout()
    else if ($('#authModal').classList.contains('is-open')) closeAuth()
    else if ($('#modal').classList.contains('is-open')) closeModal()
    else closeCart()
    return
  }
  if (e.key === 'Tab') {
    if ($('#checkoutModal').classList.contains('is-open')) {
      trapFocus(e, $('#checkoutModal .modal__panel'))
    } else if ($('#authModal').classList.contains('is-open')) {
      trapFocus(e, $('#authModal .modal__panel'))
    } else if ($('#modal').classList.contains('is-open')) {
      trapFocus(e, $('#modal .modal__panel'))
    } else if ($('#cartDrawer').classList.contains('is-open')) {
      // Keep the undo action reachable while the cart dialog traps focus.
      const toastAction = $('#toastAction')
      trapFocus(e, $('#cartDrawer'), toastAction ? [$('#toast')] : [])
    }
  }
})

$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault()
  applyView('shop', { scroll: false })
  state.query = $('#searchInput').value.trim()
  state.cat = $('#searchScope').value
  update({ categories: true })
  $('#shop').scrollIntoView({ behavior: 'smooth' })
})

let searchTimer
$('#searchInput').addEventListener('input', (e) => {
  syncSearchClear()
  clearTimeout(searchTimer)
  const value = e.target.value
  searchTimer = setTimeout(() => {
    state.query = value.trim()
    update()
  }, 130)
})

$('#searchClear').addEventListener('click', () => {
  $('#searchInput').value = ''
  state.query = ''
  syncSearchClear()
  update()
  $('#searchInput').focus()
})

$('#searchScope').addEventListener('change', (e) => {
  state.cat = e.target.value
  update({ categories: true })
})

$('#filterToggle').addEventListener('click', () => {
  const open = $('#filters').classList.toggle('is-open')
  $('#filterToggle').setAttribute('aria-expanded', String(open))
})

$('#sortSelect').addEventListener('change', (e) => {
  state.sort = e.target.value
  renderResults()
})

$('#priceRange').addEventListener('input', (e) => {
  state.maxPrice = Number(e.target.value)
  $('#priceRange').setAttribute('aria-valuetext', `Up to $${state.maxPrice}`)
  $('#priceLabel').textContent = `$${state.maxPrice}`
  renderResults()
  renderApplied()
})

$('#dealsOnly').addEventListener('change', (e) => {
  state.dealsOnly = e.target.checked
  update()
})

$('#fastOnly').addEventListener('change', (e) => {
  state.fastOnly = e.target.checked
  update()
})

$('#clearFilters').addEventListener('click', resetFilters)
$('#emptyReset').addEventListener('click', resetFilters)

$('#checkoutBtn').addEventListener('click', openCheckout)
$('#checkoutForm').addEventListener('submit', submitCheckout)
$('#checkoutCancel').addEventListener('click', () => {
  closeCheckout()
  openCart()
})

const rail = $('#dealsRail')
$('#dealsNext').addEventListener('click', () => rail.scrollBy({ left: 460, behavior: 'smooth' }))
$('#dealsPrev').addEventListener('click', () => rail.scrollBy({ left: -460, behavior: 'smooth' }))

$('#backTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
$('#logoBtn').addEventListener('click', () => {
  applyView('shop', { scroll: false })
  window.scrollTo({ top: 0, behavior: 'smooth' })
})
$('#allBtn').addEventListener('click', () => {
  applyView('shop', { scroll: false })
  state.cat = 'All'
  state.query = ''
  $('#searchInput').value = ''
  syncSearchClear()
  update({ categories: true })
  $('#collections').scrollIntoView({ behavior: 'smooth' })
})

/* ── Boot ──────────────────────────────────────────────────── */

$('#year').textContent = new Date().getFullYear()
if (new URLSearchParams(location.search).get('checkout') === 'canceled') {
  toast('Checkout canceled — your cart is still here.')
}
renderAccount()
updateWantsCount()
applyView(viewFromHash(), { scroll: false })
window.addEventListener('popstate', () => applyView(viewFromHash(), { scroll: false }))
window.addEventListener('hashchange', () => {
  applyView(viewFromHash(), { scroll: false })
  if (location.hash && location.hash !== '#for-you' && location.hash !== '#wants') {
    $(location.hash)?.scrollIntoView({ behavior: 'smooth' })
  }
})
refreshSession()

syncHeaderHeight()
paintHeroArt()
renderPromos()
renderDeals()
startDealClock()
renderCategories()
renderCart()
renderResults()
syncControls()
renderApplied()
syncSearchClear()
