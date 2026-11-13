import catalog from '../src/catalog.js'

const byId = new Map(catalog.map((product) => [product.id, product]))

/**
 * Scores the catalogue from the user's saves and paid/test orders, then picks a
 * category-diverse set of twelve. Guests get a rating-weighted popular feed.
 */
export async function buildForYou(store, userId) {
  const wanted = userId
    ? (await store.query(`SELECT product_id FROM wants WHERE user_id = ?`, [userId])).map((row) => row.product_id)
    : []

  const purchases = userId
    ? await store.query(
        `SELECT oi.product_id, oi.qty
           FROM order_items oi
           JOIN orders o ON o.ref = oi.order_ref
          WHERE o.user_id = ? AND o.status IN ('paid', 'test')`,
        [userId]
      )
    : []

  const orders = userId
    ? (
        await store.first(
          `SELECT COUNT(DISTINCT ref) AS count
             FROM orders
            WHERE user_id = ? AND status IN ('paid', 'test')`,
          [userId]
        )
      )?.count ?? 0
    : 0

  const wantCats = {}
  const orderCats = {}
  for (const id of wanted) {
    const product = byId.get(id)
    if (product) wantCats[product.cat] = (wantCats[product.cat] || 0) + 1
  }
  for (const row of purchases) {
    const product = byId.get(row.product_id)
    if (product) orderCats[product.cat] = (orderCats[product.cat] || 0) + Number(row.qty || 1)
  }

  const signalCats = {}
  for (const [cat, weight] of Object.entries(wantCats)) signalCats[cat] = (signalCats[cat] || 0) + weight * 2
  for (const [cat, weight] of Object.entries(orderCats)) signalCats[cat] = (signalCats[cat] || 0) + weight * 3
  const topCat = Object.entries(signalCats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const wantedSet = new Set(wanted)
  const scored = catalog
    .filter((product) => !wantedSet.has(product.id))
    .map((product) => {
      let boost = 0
      let reason = `Popular in ${product.cat}`
      if (orderCats[product.cat]) {
        boost = 6 + orderCats[product.cat]
        reason = `Because you bought ${product.cat}`
      } else if (wantCats[product.cat]) {
        boost = 3.5 + wantCats[product.cat]
        reason = `More ${product.cat} you saved`
      } else if (topCat === product.cat) {
        boost = 1.5
        reason = `Trending in ${product.cat}`
      }
      const base =
        product.rating * 1.1 +
        Math.log10(product.reviews + 1) * 0.55 +
        (product.badge ? 0.25 : 0)
      return { product, reason, score: base + boost }
    })
    .sort((a, b) => b.score - a.score)

  // Keep the feed varied: no more than three products from one department.
  const items = []
  const perCat = {}
  for (const entry of scored) {
    const cat = entry.product.cat
    if ((perCat[cat] || 0) >= 3) continue
    perCat[cat] = (perCat[cat] || 0) + 1
    items.push({ id: entry.product.id, reason: entry.reason })
    if (items.length === 12) break
  }

  return {
    personalized: Boolean(userId && (wanted.length > 0 || orders > 0)),
    wants: wanted.length,
    orders,
    topCategories: Object.entries(signalCats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat),
    items,
  }
}
