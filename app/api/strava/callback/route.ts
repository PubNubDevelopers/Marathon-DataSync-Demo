import { NextResponse, type NextRequest } from 'next/server'
import { SCOPE, STATE_COOKIE, TOKEN_COOKIE, exchangeCode, safeBack } from '@/lib/server/strava'

// GET /api/strava/callback?code=…&state=…&scope=…
// Strava sends the runner back here. The state must match the cookie set by /connect.
// The access token goes into an httpOnly cookie for as long as Strava says it's valid.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const [state, path] = (req.cookies.get(STATE_COOKIE)?.value ?? '').split(' ')
  const back = new URL(safeBack(path ?? null), req.nextUrl.origin)
  const done = (result: string) => {
    back.searchParams.set('strava', result)
    const res = NextResponse.redirect(back)
    res.cookies.delete({ name: STATE_COOKIE, path: '/api/strava' })
    return res
  }
  if (!state || q.get('state') !== state) return done('expired')
  if (q.get('error') || !q.get('code')) return done('denied')
  if (!(q.get('scope') ?? '').split(',').includes(SCOPE)) return done('no-upload')
  try {
    const token = await exchangeCode(q.get('code')!)
    const res = done('connected')
    const maxAge = Math.max(60, token.expiresAt - Math.floor(Date.now() / 1000))
    res.cookies.set(TOKEN_COOKIE, JSON.stringify(token), { httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', path: '/api/strava', maxAge })
    return res
  } catch (err) {
    console.error('strava code exchange failed', err)
    return done('failed')
  }
}
