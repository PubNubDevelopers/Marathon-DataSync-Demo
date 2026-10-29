import type { NextRequest } from 'next/server'
import { SLUG_PATTERN } from '@/lib/race'
import { verifyRunnerSecret } from '@/lib/server/pubnub'
import { MAX_GPX_BYTES, TOKEN_COOKIE, readToken, stravaConfig, uploadRun } from '@/lib/server/strava'

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}

// POST /api/strava/upload  { gpx, name, description }   with x-race-run and x-race-key, like /api/timing
//
// The runner's page sends the GPX it built from its own track, and this server passes it
// to Strava with the token from the cookie. external_id is the run's slug, so Strava
// refuses a second upload of the same run as a duplicate.
export async function POST(req: NextRequest) {
  if (!stravaConfig()) return fail(503, 'Strava is not set up on this server')
  const slug = req.headers.get('x-race-run') ?? ''
  if (!SLUG_PATTERN.test(slug) || !(await verifyRunnerSecret(slug, req.headers.get('x-race-key') ?? ''))) return fail(403, 'This is not the runner link')
  const token = readToken(req.cookies.get(TOKEN_COOKIE)?.value)
  if (!token) return fail(401, 'Connect Strava first')
  const body = (await req.json().catch(() => null)) as { gpx?: unknown; name?: unknown; description?: unknown } | null
  const gpx = body?.gpx
  if (typeof gpx !== 'string' || !gpx.startsWith('<?xml') || !gpx.includes('<trkpt') || Buffer.byteLength(gpx, 'utf8') > MAX_GPX_BYTES) return fail(400, 'Send { gpx, name, description } with a GPX track')
  const name = typeof body?.name === 'string' ? body.name.slice(0, 100) : 'Riverside Marathon'
  const description = typeof body?.description === 'string' ? body.description.slice(0, 500) : ''
  try {
    const result = await uploadRun(token.token, { gpx, name, description, externalId: `riverside-marathon-${slug}` })
    const res = Response.json(result, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
    return result.status === 401 ? withoutToken(res) : res
  } catch (err) {
    console.error('strava upload failed', err)
    return fail(502, 'Could not reach Strava')
  }
}

// Strava refused the token: forget it, so the page offers to connect again.
function withoutToken(res: Response) {
  res.headers.append('Set-Cookie', `${TOKEN_COOKIE}=; Path=/api/strava; Max-Age=0; HttpOnly; SameSite=Lax`)
  return res
}
