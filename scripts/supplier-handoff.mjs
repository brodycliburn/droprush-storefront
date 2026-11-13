/**
 * Supplier handoff helper.
 *
 *   bun run supplier:export
 *   bun run supplier:export -- --supplier "Supplier name" --status all
 *   bun run supplier:mark-sent -- DR-XXXX-XXXX
 *
 * Reads ADMIN_TOKEN and PUBLIC_API_URL from the environment (.env is loaded by
 * the package scripts). The export contains paid orders whose supplier status
 * is "ready" by default; pass --status all to include orders already marked
 * sent. Pass --supplier to export only that supplier's line items.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    console.error(`${flag} requires a value.`)
    process.exit(1)
  }
  return value
}

const base = (process.env.PUBLIC_API_URL || 'http://127.0.0.1:8788').replace(/\/+$/, '')
const token = String(process.env.ADMIN_TOKEN || '').trim()
if (!token) {
  console.error('Set ADMIN_TOKEN to the same value configured on the API before exporting supplier orders.')
  process.exit(1)
}

const headers = { authorization: `Bearer ${token}` }

const sentReference = valueAfter('--sent')
if (sentReference) {
  const res = await fetch(`${base}/api/supplier/orders/${encodeURIComponent(sentReference)}/sent`, {
    method: 'POST',
    headers,
  })
  const body = await res.text()
  if (!res.ok) {
    console.error(`Could not mark ${sentReference}: ${body || res.statusText}`)
    process.exit(1)
  }
  console.log(body)
  process.exit(0)
}

const status = valueAfter('--status') || 'ready'
const supplier = valueAfter('--supplier')
const date = new Date().toISOString().slice(0, 10)
const outputPath = resolve(valueAfter('--out') || `.data/supplier-orders-${date}.csv`)
const params = new URLSearchParams({ status })
if (supplier) params.set('supplier', supplier)

const res = await fetch(`${base}/api/supplier/orders.csv?${params}`, { headers })
const csv = await res.text()
if (!res.ok) {
  console.error(`Supplier export failed: ${csv || res.statusText}`)
  process.exit(1)
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, csv, { mode: 0o600 })
if (!supplier) {
  console.warn('No --supplier filter: this CSV includes every supplier. Pass --supplier before sending it to one supplier.')
}
const rows = Math.max(0, csv.trim().split(/\r?\n/).length - 1)
console.log(`Wrote ${outputPath} (${rows} item row${rows === 1 ? '' : 's'}, status ${status})`)
