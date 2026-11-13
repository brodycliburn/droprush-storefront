/**
 * Copy the local SQLite database into a hosted Turso/libSQL database.
 *
 *   bun run db:export          # writes .data/turso-import.sql for review
 *   bun run db:push            # also applies it using TURSO_DATABASE_URL/TOKEN
 *
 * Sessions are intentionally not copied: deploying invalidates browser
 * sessions, and users sign in again with their existing password hash.
 * Review the generated SQL (or the source data) before pushing production
 * data; the local database normally contains development test accounts.
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient } from '@libsql/client'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const outputArg = args.find((arg) => !arg.startsWith('--'))
const sourcePath = resolve(process.env.ORDER_DB || '.data/orders.db')
const outputPath = resolve(outputArg || '.data/turso-import.sql')

if (!existsSync(sourcePath)) {
  console.error(`No local database found at ${sourcePath}. Set ORDER_DB if it lives elsewhere.`)
  process.exit(1)
}

const tables = [
  { name: 'users', columns: ['id', 'email', 'name', 'password_hash', 'created_at'] },
  { name: 'wants', columns: ['user_id', 'product_id', 'created_at'] },
  {
    name: 'orders',
    columns: [
      'ref',
      'created_at',
      'status',
      'email',
      'user_id',
      'ship_name',
      'ship_phone',
      'ship_line1',
      'ship_line2',
      'ship_city',
      'ship_region',
      'ship_postal',
      'ship_country',
      'currency',
      'subtotal_cents',
      'shipping_cents',
      'total_cents',
      'stripe_session_id',
      'stripe_payment_intent',
      'paid_at',
      'supplier_status',
      'supplier_sent_at',
      'carrier',
      'tracking_number',
      'tracking_url',
      'notes',
    ],
  },
  {
    name: 'order_items',
    columns: ['order_ref', 'product_id', 'name', 'supplier', 'unit_cents', 'qty', 'supplier_order_ref'],
    orderBy: 'id',
  },
  {
    name: 'order_events',
    columns: ['order_ref', 'at', 'type', 'detail'],
    orderBy: 'id',
  },
]

const db = new DatabaseSync(sourcePath)
const orderColumns = db.prepare(`SELECT name FROM pragma_table_info('orders')`).all()
const orderColumnNames = new Set(orderColumns.map((column) => column.name))
const orderAdditions = [
  ['user_id', 'TEXT'],
  ['ship_name', 'TEXT'],
  ['ship_phone', 'TEXT'],
  ['ship_line1', 'TEXT'],
  ['ship_line2', 'TEXT'],
  ['ship_city', 'TEXT'],
  ['ship_region', 'TEXT'],
  ['ship_postal', 'TEXT'],
  ['ship_country', 'TEXT'],
  ['supplier_sent_at', 'TEXT'],
]
for (const [name, type] of orderAdditions) {
  if (!orderColumnNames.has(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`)
}

const rowsFor = ({ name, columns, orderBy }) => {
  const sql = `SELECT ${columns.join(', ')} FROM ${name}${orderBy ? ` ORDER BY ${orderBy}` : ''}`
  return db.prepare(sql).all()
}

const quote = (value) => {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${String(value).replace(/'/g, "''")}'`
}

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const data = new Map(tables.map((table) => [table.name, rowsFor(table)]))
const lines = [
  '-- DROPRUSH hosted database import',
  `-- Source: ${sourcePath}`,
  `-- Generated: ${new Date().toISOString()}`,
  '-- Sessions are intentionally omitted. Test data may be present; review before importing.',
  '',
  schema.trim(),
  '',
  'BEGIN TRANSACTION;',
]

for (const table of tables) {
  const rows = data.get(table.name)
  lines.push(`-- ${table.name}: ${rows.length} row(s)`)
  for (const row of rows) {
    const values = table.columns.map((column) => quote(row[column]))
    lines.push(
      `INSERT OR IGNORE INTO ${table.name} (${table.columns.join(', ')}) VALUES (${values.join(', ')});`
    )
  }
  lines.push('')
}
lines.push('COMMIT;', '')

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, lines.join('\n'))
const summary = Object.fromEntries([...data].map(([name, rows]) => [name, rows.length]))
console.log(`Wrote ${outputPath}`)
console.log(JSON.stringify({ tables: summary, sessions: 'excluded', apply }, null, 2))

if (apply) {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!url || !authToken) {
    console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before using --apply.')
    process.exit(1)
  }
  if (url.startsWith('file:')) {
    console.error('--apply expects a hosted libsql:// URL, not a local file.')
    process.exit(1)
  }

  const client = createClient({ url, authToken })
  try {
    await client.executeMultiple(schema)
    for (const table of tables) {
      const rows = data.get(table.name)
      for (let index = 0; index < rows.length; index += 100) {
        const chunk = rows.slice(index, index + 100)
        const statements = chunk.map((row) => ({
          sql: `INSERT OR IGNORE INTO ${table.name} (${table.columns.join(', ')}) VALUES (${table.columns.map(() => '?').join(', ')})`,
          args: table.columns.map((column) => row[column]),
        }))
        if (statements.length) await client.batch(statements, 'write')
      }
      console.log(`Applied ${table.name}: ${rows.length} row(s)`)
    }
  } finally {
    client.close()
    db.close()
  }
} else {
  db.close()
}
