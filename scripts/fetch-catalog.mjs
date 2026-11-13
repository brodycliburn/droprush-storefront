/**
 * Builds src/catalog.json (raw data) and src/catalog.js (what the app and the
 * checkout API import) and downloads product photos into public/products/.
 * Photos come from the public DummyJSON demo product dataset (sample shop data,
 * neutral studio shots). Replace the image files with your own supplier photos
 * before shipping a real store.
 *
 * Usage: node scripts/fetch-catalog.mjs
 */
import { mkdir, writeFile, stat } from 'node:fs/promises'

const PICKS = [
  // Tech & Gadgets
  { id: 100, cat: 'Tech & Gadgets', badge: 'Best Seller', was: 149.99 },
  { id: 107, cat: 'Tech & Gadgets' },
  { id: 105, cat: 'Tech & Gadgets', was: 119.99 },
  { id: 102, cat: 'Tech & Gadgets', was: 99.99 },
  { id: 103, cat: 'Tech & Gadgets' },
  { id: 99, cat: 'Tech & Gadgets', badge: 'Trending' },

  // Home & Kitchen
  { id: 51, cat: 'Home & Kitchen', badge: 'Best Seller', was: 49.99 },
  { id: 47, cat: 'Home & Kitchen', badge: 'Trending', was: 59.99 },
  { id: 46, cat: 'Home & Kitchen' },
  { id: 44, cat: 'Home & Kitchen' },
  { id: 73, cat: 'Home & Kitchen', was: 24.99 },
  { id: 65, cat: 'Home & Kitchen' },

  // Beauty
  { id: 1, cat: 'Beauty', badge: 'Best Seller' },
  { id: 2, cat: 'Beauty', was: 24.99 },
  { id: 3, cat: 'Beauty' },
  { id: 4, cat: 'Beauty' },
  { id: 5, cat: 'Beauty' },
  { id: 120, cat: 'Beauty' },

  // Fitness
  { id: 140, cat: 'Fitness', badge: 'Trending' },
  { id: 137, cat: 'Fitness', was: 24.99 },
  { id: 152, cat: 'Fitness' },
  { id: 150, cat: 'Fitness' },
  { id: 151, cat: 'Fitness' },

  // Pets
  { id: 22, cat: 'Pets' },
  { id: 18, cat: 'Pets' },

  // Style
  { id: 156, cat: 'Style', was: 44.99 },
  { id: 154, cat: 'Style' },
  { id: 173, cat: 'Style', badge: 'Trending' },
  { id: 93, cat: 'Style' },
  { id: 175, cat: 'Style' },
]

const SUPPLIERS = {
  'Tech & Gadgets': 'Shenzhen Digital Hub · CN',
  'Home & Kitchen': 'Foshan Home Supply · CN',
  Beauty: 'Guangzhou Beauty Lab · CN',
  Fitness: 'Ningbo Sports Co · CN',
  Pets: 'Nantong Pet Supply · CN',
  Style: 'Yiwu Accessories · CN',
}

/**
 * The sample dataset ships trademarked product names. Generated catalogues use
 * generic equivalents instead, with a neutral slug for the downloaded photo.
 */
const RENAMES = {
  1: {
    name: 'Volumizing Lash Mascara',
    slug: 'volumizing-lash-mascara',
    blurb: 'A buildable volumizing mascara with a tapered brush that lifts, separates and lengthens lashes without clumping.',
  },
  120: {
    name: "Men's Daily Face & Body Lotion",
    slug: 'mens-daily-face-body-lotion',
    blurb: 'A lightweight face and body lotion for men that absorbs quickly and keeps skin hydrated all day.',
  },
  173: {
    name: "Women's Leather Tote Bag",
    slug: 'womens-leather-tote-bag',
    blurb: 'A structured leather tote with a roomy lined interior, twin top handles and a detachable shoulder strap.',
  },
  99: {
    name: 'Fabric-Wrapped Smart Speaker',
    slug: 'fabric-wrapped-smart-speaker',
    blurb: 'A fabric-wrapped smart speaker with room-filling sound and hands-free voice control for any room.',
  },
  103: {
    name: 'Compact Smart Speaker, Charcoal',
    slug: 'compact-smart-speaker-charcoal',
    blurb: 'A palm-sized smart speaker with 360° sound, voice control and a soft charcoal mesh finish.',
  },
  100: {
    name: 'Wireless Earbuds with Charging Case',
    slug: 'wireless-earbuds-charging-case',
    blurb: 'True wireless earbuds with touch controls, up to 5 hours per charge and a pocket-sized charging case.',
  },
  107: {
    name: 'Neckband Wireless Earphones',
    slug: 'neckband-wireless-earphones',
    blurb: 'Lightweight neckband earphones with magnetic earbuds, a tangle-free cable and all-day battery life.',
  },
  105: {
    name: 'Magnetic Portable Battery Pack',
    slug: 'magnetic-portable-battery-pack',
    blurb: 'A slim magnetic battery pack that snaps onto compatible phones for extra charge without a cable.',
  },
  102: {
    name: '3-in-1 Wireless Charging Pad',
    slug: '3-in-1-wireless-charging-pad',
    blurb: 'A flat charging pad that tops up a phone, earbuds case and watch together, with a non-slip surface.',
  },
}

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const firstSentence = (text, max = 155) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  const cut = clean.slice(0, max)
  const end = cut.lastIndexOf('. ')
  const out = end > 60 ? cut.slice(0, end + 1) : cut
  return out.replace(/\.\.+$/, '.')
}

const res = await fetch('https://dummyjson.com/products?limit=200')
if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`)
const data = await res.json()
const byId = new Map(data.products.map((p) => [p.id, p]))

await mkdir('public/products', { recursive: true })

const catalog = []
let downloaded = 0
const missing = []

for (const pick of PICKS) {
  const product = byId.get(pick.id)
  if (!product) {
    missing.push(pick.id)
    continue
  }

  const rename = RENAMES[product.id]
  const name = rename?.name ?? product.title
  const blurb = rename?.blurb ?? firstSentence(product.description)
  const imgUrl = product.images?.[0] || product.thumbnail
  const slug = rename?.slug ?? slugify(product.title)
  const file = `public/products/${slug}.webp`

  try {
    const imgRes = await fetch(imgUrl)
    if (!imgRes.ok) throw new Error(`image ${imgRes.status}`)
    const buf = Buffer.from(await imgRes.arrayBuffer())
    if (buf.length < 3000 || buf.subarray(0, 4).toString() !== 'RIFF') {
      throw new Error('not a webp image')
    }
    await writeFile(file, buf)
    downloaded += 1
  } catch (err) {
    console.warn(`! ${product.title}: ${err.message}`)
  }

  const rating = Math.min(4.9, Math.max(4.1, Number(product.rating) || 4.2))
  const reviews = 320 + ((product.id * 977) % 8600)
  const soldUnits = 1.2 + ((product.id * 13) % 210) / 10

  catalog.push({
    id: `d${product.id}`,
    name,
    cat: pick.cat,
    price: Number(product.price),
    was: pick.was ?? null,
    rating: Number(rating.toFixed(1)),
    reviews,
    badge: pick.badge ?? (pick.was ? 'Deal' : null),
    sold: `${soldUnits.toFixed(1)}k bought last month`,
    blurb,
    supplier: SUPPLIERS[pick.cat],
    stock: Math.max(12, Number(product.stock) || 40),
    qps: 3 + (product.id % 3),
    img: `/products/${slug}.webp`,
  })
}

catalog.sort((a, b) => a.cat.localeCompare(b.cat) || b.rating - a.rating)

await writeFile('src/catalog.json', `${JSON.stringify(catalog, null, 2)}\n`)
await writeFile('src/catalog.js', `export default ${JSON.stringify(catalog, null, 2)}\n`)

const total = catalog.reduce(async (p, c) => {
  const acc = await p
  try {
    const s = await stat(`public${c.img}`)
    return acc + s.size
  } catch {
    return acc
  }
}, Promise.resolve(0))

console.log(`catalog entries: ${catalog.length}`)
console.log(`images downloaded: ${downloaded}`)
console.log(`total image bytes: ${await total}`)
if (missing.length) console.log('missing ids:', missing.join(', '))
console.log('departments:', [...new Set(catalog.map((c) => c.cat))].join(' | '))
