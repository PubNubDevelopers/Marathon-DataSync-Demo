import type { NextRequest } from 'next/server'
import { TOKEN_COOKIE, readToken, stravaConfig } from '@/lib/server/strava'

// GET /api/strava
// Whether this server can upload to Strava (it has a Strava API app), and whether this
// browser has connected a Strava account. The token itself never leaves the cookie.
export async function GET(req: NextRequest) {
  const token = readToken(req.cookies.get(TOKEN_COOKIE)?.value)
  return Response.json({ enabled: !!stravaConfig(), connected: !!token, athlete: token?.athlete ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}
