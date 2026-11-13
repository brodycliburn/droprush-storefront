-- DROPRUSH accounts, orders, want lists. Runs on SQLite (local dev) and Turso/libSQL (hosted).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wants (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  ref TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  email TEXT,
  user_id TEXT,
  ship_name TEXT,
  ship_phone TEXT,
  ship_line1 TEXT,
  ship_line2 TEXT,
  ship_city TEXT,
  ship_region TEXT,
  ship_postal TEXT,
  ship_country TEXT,
  currency TEXT NOT NULL DEFAULT 'usd',
  subtotal_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  paid_at TEXT,
  supplier_status TEXT NOT NULL DEFAULT 'unassigned',
  supplier_sent_at TEXT,
  carrier TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_ref TEXT NOT NULL REFERENCES orders(ref) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  supplier TEXT NOT NULL,
  unit_cents INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  supplier_order_ref TEXT
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_ref TEXT NOT NULL REFERENCES orders(ref) ON DELETE CASCADE,
  at TEXT NOT NULL,
  type TEXT NOT NULL,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_handoff ON orders(status, supplier_status);
CREATE INDEX IF NOT EXISTS idx_order_items_ref ON order_items(order_ref);
CREATE INDEX IF NOT EXISTS idx_order_events_ref ON order_events(order_ref);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_wants_user ON wants(user_id);
