// auth.js : one shared password (APP_PASSWORD) protects every /api route except /api/login.
// After a correct password the browser gets a cookie. The cookie value is a hash made from the
// password, so the server needs no session storage (important on Vercel, where there is no memory between requests).
import crypto from 'node:crypto'

const COOKIE = 'vq_auth'

// The value we expect in the cookie
function expectedToken() {
  return crypto.createHmac('sha256', process.env.APP_PASSWORD).update('vocal-query').digest('hex')
}

function same(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y) // timingSafeEqual: no timing hints for attackers
}

function readCookie(req) {
  const match = (req.headers.cookie || '').match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`))
  return match ? match[1] : ''
}

// Express middleware: let the request through only if it is logged in.
export function requireLogin(req, res, next) {
  if (req.path === '/login') return next() // the login route itself
  if (!process.env.APP_PASSWORD) {
    // Not set: fine on your laptop, but never leave a deployed app open.
    if (process.env.VERCEL) return res.status(503).json({ error: 'APP_PASSWORD is not set on the server.' })
    return next()
  }
  if (same(readCookie(req), expectedToken())) return next()
  res.status(401).json({ error: 'Please log in.' })
}

// POST /api/login  { password }
export async function login(req, res) {
  await new Promise((resolve) => setTimeout(resolve, 600)) // slows down password guessing
  if (!process.env.APP_PASSWORD || !same(req.body.password || '', process.env.APP_PASSWORD)) {
    return res.status(401).json({ error: 'Wrong password.' })
  }
  const secure = process.env.VERCEL ? '; Secure' : '' // Secure = only sent over https
  res.setHeader('Set-Cookie', `${COOKIE}=${expectedToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`)
  res.json({ ok: true })
}
