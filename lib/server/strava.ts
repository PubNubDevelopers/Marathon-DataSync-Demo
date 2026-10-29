import 'server-only'

// Strava, for the runner's "Upload to Strava" after the finish. Optional: without
// STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET the button stays hidden, and the runner can
// still save a GPX file and upload it on strava.com.
//
// The flow is Strava's OAuth for web apps with the activity:write scope. The access token
// lives in an httpOnly cookie on this site for its six hours, so the browser never reads
// it and the server keeps no store of its own. A new Strava API app connects only its
// owner's account until Strava raises its athlete capacity.

const API = 'https://www.strava.com/api/v3'
export const TOKEN_COOKIE = 'strava_token'
export const STATE_COOKIE = 'strava_state'
export const SCOPE = 'activity:write'
// A marathon at one point a second is about 2 MB of GPX.
export const MAX_GPX_BYTES = 4_000_000

export type StravaToken = { token: string; expiresAt: number; athlete?: string }

export function stravaConfig() {
  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string) {
  const url = new URL('https://www.strava.com/oauth/authorize')
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', approval_prompt: 'auto', scope: SCOPE, state }).toString()
  return url.toString()
}

export async function exchangeCode(code: string): Promise<StravaToken> {
  const config = stravaConfig()
  if (!config) throw new Error('Strava is not set up on this server')
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, grant_type: 'authorization_code' }),
  })
  if (!res.ok) throw new Error(`Strava answered ${res.status} to the code exchange`)
  const body = (await res.json()) as { access_token: string; expires_at: number; athlete?: { firstname?: string } }
  if (!body.access_token || !Number.isFinite(body.expires_at) || body.expires_at * 1000 <= Date.now()) throw new Error('Strava returned an invalid access token')
  return { token: body.access_token, expiresAt: body.expires_at, athlete: body.athlete?.firstname }
}

export function readToken(raw: string | undefined): StravaToken | null {
  if (!raw) return null
  try {
    const t = JSON.parse(raw) as StravaToken
    return typeof t.token === 'string' && t.token.length > 0 && Number.isFinite(t.expiresAt) && t.expiresAt * 1000 > Date.now() + 60_000 ? t : null
  } catch {
    return null
  }
}

/** A path on this site to come back to after Strava. Anything else goes home. */
export function safeBack(back: string | null) {
  return back && /^\/run\/[a-z0-9]{10}$/.test(back) ? back : '/'
}

export type UploadResult = { status: number; activityId?: number; error?: string; message?: string }

const plain = (text: string) => text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

/**
 * Uploads a GPX run and waits a few seconds for Strava to turn it into an activity.
 * Strava asks for polling no more than once a second.
 */
export async function uploadRun(token: string, run: { gpx: string; name: string; description: string; externalId: string }): Promise<UploadResult> {
  const form = new FormData()
  form.set('file', new Blob([run.gpx], { type: 'application/gpx+xml' }), `${run.externalId}.gpx`)
  form.set('data_type', 'gpx')
  form.set('sport_type', 'Run')
  form.set('name', run.name)
  form.set('description', run.description)
  form.set('external_id', run.externalId)
  const auth = { Authorization: `Bearer ${token}` }
  const res = await fetch(`${API}/uploads`, { method: 'POST', headers: auth, body: form })
  const body = (await res.json().catch(() => ({}))) as { id?: number; error?: string | null; activity_id?: number | null; message?: string }
  if (!res.ok || body.error) return { status: res.status === 401 ? 401 : res.ok ? 400 : res.status, error: plain(body.error ?? body.message ?? `Strava answered ${res.status}`) }
  if (body.activity_id) return { status: 200, activityId: body.activity_id }
  if (!body.id) return { status: 502, error: 'Strava did not return an upload ID' }
  for (let i = 0; i < 8 && body.id; i++) {
    await new Promise((r) => setTimeout(r, 1500))
    const poll = await fetch(`${API}/uploads/${body.id}`, { headers: auth })
    const state = (await poll.json().catch(() => ({}))) as { error?: string | null; activity_id?: number | null; status?: string }
    if (!poll.ok || state.error) return { status: poll.status === 401 ? 401 : poll.ok ? 400 : poll.status, error: plain(state.error ?? `Strava answered ${poll.status}`) }
    if (state.activity_id) return { status: 200, activityId: state.activity_id }
  }
  return { status: 202, message: 'Strava is still processing the run. It will show up in your activities.' }
}
