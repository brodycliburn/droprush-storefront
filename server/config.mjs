/**
 * Deployment configuration for the checkout API.
 *
 * Local development keeps the existing zero-config behaviour: no Stripe key
 * means test orders, and a SQLite file under .data/ is used. Production fails
 * fast instead of silently running a demo checkout or an ephemeral database.
 */

const value = (name) => String(process.env[name] ?? '').trim()
const stripTrailingSlash = (input) => input.replace(/\/+$/, '')
const isHttpUrl = (input) => {
  try {
    const url = new URL(input)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
const isHttpsUrl = (input) => {
  try {
    return new URL(input).protocol === 'https:'
  } catch {
    return false
  }
}
const asOrigin = (input) => {
  try {
    return new URL(input).origin
  } catch {
    return input
  }
}
const enabled = (input) => ['1', 'true', 'yes', 'on'].includes(input.toLowerCase())

const env = value('NODE_ENV') || 'development'
const production = env === 'production'
const port = Number(value('PORT') || value('API_PORT') || 8788)
const host = value('HOST') || (production ? '0.0.0.0' : '127.0.0.1')
const publicSiteUrl = stripTrailingSlash(value('PUBLIC_SITE_URL'))
const publicApiUrl = stripTrailingSlash(value('PUBLIC_API_URL')) || publicSiteUrl
const tursoUrl = value('TURSO_DATABASE_URL')
const tursoAuthToken = value('TURSO_AUTH_TOKEN')
const stripeSecretKey = value('STRIPE_SECRET_KEY')
const stripeWebhookSecret = value('STRIPE_WEBHOOK_SECRET')
const adminToken = value('ADMIN_TOKEN')

const defaultOrigins = production ? '' : 'http://localhost:3000,http://127.0.0.1:3000'
const allowedOrigins = new Set(
  (value('ALLOWED_ORIGINS') || publicSiteUrl || defaultOrigins)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(asOrigin)
)
if (publicSiteUrl && isHttpUrl(publicSiteUrl)) allowedOrigins.add(asOrigin(publicSiteUrl))

const errors = []
const warnings = []

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  errors.push('PORT must be an integer between 1 and 65535.')
}

if (publicSiteUrl && !isHttpUrl(publicSiteUrl)) {
  errors.push('PUBLIC_SITE_URL must be an absolute http(s) URL.')
}
if (publicApiUrl && !isHttpUrl(publicApiUrl)) {
  errors.push('PUBLIC_API_URL must be an absolute http(s) URL.')
}

if (production) {
  if (!publicSiteUrl) errors.push('PUBLIC_SITE_URL is required in production.')
  if (publicSiteUrl && !isHttpsUrl(publicSiteUrl)) {
    errors.push('PUBLIC_SITE_URL must use HTTPS in production.')
  }
  if (publicApiUrl && !isHttpsUrl(publicApiUrl)) {
    errors.push('PUBLIC_API_URL must use HTTPS in production.')
  }
  if (!tursoUrl) {
    errors.push('TURSO_DATABASE_URL is required in production (hosted libSQL/SQLite).')
  } else if (tursoUrl.startsWith('file:')) {
    errors.push('TURSO_DATABASE_URL must point at a hosted libSQL database in production, not a local file.')
  }
  if (!tursoAuthToken) errors.push('TURSO_AUTH_TOKEN is required in production.')
  if (!stripeSecretKey) {
    errors.push('STRIPE_SECRET_KEY is required in production so checkout cannot fall back to free test orders.')
  }
  if (!stripeWebhookSecret) {
    errors.push('STRIPE_WEBHOOK_SECRET is required in production so paid orders can be confirmed.')
  }
  if (!adminToken) {
    errors.push('ADMIN_TOKEN is required in production to protect supplier order exports.')
  } else if (adminToken.length < 24) {
    errors.push('ADMIN_TOKEN must be at least 24 characters.')
  }
  if (stripeSecretKey && !stripeSecretKey.startsWith('sk_live_')) {
    warnings.push('STRIPE_SECRET_KEY is not a live key (sk_live_...); real cards will not be charged.')
  }
  if (stripeWebhookSecret && !stripeWebhookSecret.startsWith('whsec_')) {
    warnings.push('STRIPE_WEBHOOK_SECRET does not look like a Stripe webhook signing secret.')
  }
  if (
    publicSiteUrl &&
    publicApiUrl &&
    isHttpUrl(publicSiteUrl) &&
    isHttpUrl(publicApiUrl) &&
    new URL(publicSiteUrl).origin !== new URL(publicApiUrl).origin
  ) {
    warnings.push(
      'PUBLIC_SITE_URL and PUBLIC_API_URL differ. The current frontend calls /api on its own origin, so put a reverse proxy in front or update the frontend API base URL.'
    )
  }
}

const stripeMode = stripeSecretKey ? (stripeSecretKey.startsWith('sk_live_') ? 'live' : 'test') : 'none'
const webhookPath = '/api/stripe/webhook'

export const config = Object.freeze({
  env,
  production,
  host,
  port,
  orderDb: value('ORDER_DB') || '.data/orders.db',
  tursoUrl,
  tursoAuthToken,
  stripeSecretKey,
  stripeWebhookSecret,
  adminToken,
  stripeMode,
  publicSiteUrl,
  publicApiUrl,
  allowedOrigins,
  trustProxy: enabled(value('TRUST_PROXY')),
  webhookPath,
  webhookUrl: publicApiUrl ? `${publicApiUrl}${webhookPath}` : null,
})

export const configErrors = errors
export const configWarnings = warnings

export function assertConfig() {
  if (errors.length) {
    const error = new Error(`Invalid deployment configuration:\n- ${errors.join('\n- ')}`)
    error.code = 'CONFIG_INVALID'
    throw error
  }
  for (const warning of warnings) console.warn(`[config] ${warning}`)
}

/** Safe values to print in a deploy check; never includes secrets. */
export function deploymentSummary() {
  return {
    environment: config.env,
    listen: `${config.host}:${config.port}`,
    database: config.tursoUrl ? 'turso' : `sqlite:${config.orderDb}`,
    stripeMode: config.stripeMode,
    publicSiteUrl: config.publicSiteUrl || null,
    publicApiUrl: config.publicApiUrl || null,
    allowedOrigins: [...config.allowedOrigins],
    webhookUrl: config.webhookUrl,
    webhookPath: config.webhookPath,
    webhookSecretConfigured: Boolean(config.stripeWebhookSecret),
    stripeKeyConfigured: Boolean(config.stripeSecretKey),
    supplierExportConfigured: Boolean(config.adminToken),
    hostedDatabaseConfigured: Boolean(config.tursoUrl && config.tursoAuthToken),
  }
}
