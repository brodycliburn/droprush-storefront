/**
 * Store adapter for the checkout API.
 *
 * - Hosted/production: Turso (libSQL) over HTTPS using @libsql/client.
 * - Local fallback: Node's built-in SQLite file database.
 *
 * Both expose the same tiny interface used by the API:
 *   query(sql, params), first(sql, params), run(sql, params), batch(statements), close()
 * `batch` is transactional and is used for order creation and payment updates.
 */
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const schemaSql = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER)

const normalizeValue = (value) => {
  if (typeof value !== 'bigint') return value
  return value <= MAX_SAFE && value >= MIN_SAFE ? Number(value) : value.toString()
}

const normalizeRow = (row, columns) => {
  if (!row) return row
  const out = {}
  columns.forEach((column, index) => {
    const value = Object.prototype.hasOwnProperty.call(row, column) ? row[column] : row[index]
    out[column] = normalizeValue(value)
  })
  return out
}

async function openRemoteStore({ url, authToken }) {
  const { createClient } = await import('@libsql/client')
  const client = createClient({ url, authToken })
  await client.executeMultiple(schemaSql)

  const rowsFrom = (result) => result.rows.map((row) => normalizeRow(row, result.columns))
  return {
    kind: 'turso',
    async query(sql, params = []) {
      return rowsFrom(await client.execute({ sql, args: params }))
    },
    async first(sql, params = []) {
      return rowsFrom(await client.execute({ sql, args: params }))[0] ?? null
    },
    async run(sql, params = []) {
      await client.execute({ sql, args: params })
    },
    async batch(statements) {
      if (!statements.length) return
      await client.batch(
        statements.map(({ sql, args = [] }) => ({ sql, args })),
        'write'
      )
    },
    async close() {
      client.close()
    },
  }
}

async function openLocalStore(dbPath) {
  const { DatabaseSync } = await import('node:sqlite')
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(schemaSql)

  return {
    kind: 'sqlite',
    async query(sql, params = []) {
      return db.prepare(sql).all(...params)
    },
    async first(sql, params = []) {
      return db.prepare(sql).get(...params) ?? null
    },
    async run(sql, params = []) {
      db.prepare(sql).run(...params)
    },
    async batch(statements) {
      if (!statements.length) return
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const { sql, args = [] } of statements) db.prepare(sql).run(...args)
        db.exec('COMMIT')
      } catch (error) {
        try {
          db.exec('ROLLBACK')
        } catch {
          /* the transaction may already be closed */
        }
        throw error
      }
    },
    async close() {
      db.close()
    },
  }
}

/** Applies migrations for databases created before accounts and supplier handoff. */
async function migrate(store) {
  const columns = await store.query(`SELECT name FROM pragma_table_info('orders')`)
  const names = new Set(columns.map((column) => column.name))
  const additions = [
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
  for (const [name, type] of additions) {
    if (!names.has(name)) await store.run(`ALTER TABLE orders ADD COLUMN ${name} ${type}`)
  }
  await store.run('CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)')
  await store.run('CREATE INDEX IF NOT EXISTS idx_orders_handoff ON orders(status, supplier_status)')
}

export async function openStore(config) {
  const store = config.tursoUrl
    ? await openRemoteStore({ url: config.tursoUrl, authToken: config.tursoAuthToken })
    : await openLocalStore(config.orderDb)
  await migrate(store)
  return store
}
