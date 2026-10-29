import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { STATE_COOKIE, authorizeUrl, safeBack, stravaConfig } from '@/lib/server/strava'

// GET /api/strava/connect?back=/run/<slug>
// Sends the runner to Strava to allow uploads (scope activity:write). A random state in an
// httpOnly cookie ties Strava's answer to this browser, and remembers the page to return to.
export async function GET(req: NextRequest) {
  const config = stravaConfig()
  if (!config) return Response.json({ error: 'Strava is not set up on this server' }, { status: 503 })
  const state = randomBytes(16).toString('hex')
  const back = safeBack(req.nextUrl.searchParams.get('back'))
  const redirectUri = new URL('/api/strava/callback', req.nextUrl.origin).toString()
  const res = NextResponse.redirect(authorizeUrl(config.clientId, redirectUri, state))
  res.cookies.set(STATE_COOKIE, `${state} ${back}`, { httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', path: '/api/strava', maxAge: 600 })
  return res
}
