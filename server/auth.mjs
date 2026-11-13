import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SCRYPT_KEYLEN = 64
const COOKIE_NAME = 'droprush_session'
export const SESSION_DAYS = 30

export function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export function verifyPassword(password, stored) {
  const [algo, saltPart, hashPart] = String(stored || '').split('$')
  if (algo !== 'scrypt' || !saltPart || !hashPart) return false
  const salt = Buffer.from(saltPart, 'base64url')
  const expected = Buffer.from(hashPart, 'base64url')
  const actual = scryptSync(password, salt, expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export const newSessionToken = () => randomBytes(32).toString('base64url')
export const hashToken = (token) => createHash('sha256').update(token).digest('hex')

export function parseCookies(header = '') {
  const out = {}
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    if (key) out[key] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return out
}

export const sessionTokenFrom = (req) => parseCookies(req.headers.cookie)[COOKIE_NAME]

export function sessionCookie(token, secure = false) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`
}

export function clearSessionCookie(secure = false) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
}

export const isSecureRequest = (req) => {
  if (req.socket?.encrypted) return true
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  return forwarded === 'https'
}
