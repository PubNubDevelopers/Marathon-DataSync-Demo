import { SLUG_PATTERN, TIMING_MATS } from '@/lib/race'
import { recordMat, verifyRunnerSecret } from '@/lib/server/pubnub'
import { accessManagerUrl, sharedResponse } from '@/lib/server/access-manager'

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}

// POST /api/timing  { km }   with x-race-run and x-race-key, like /api/voice
//
// The organiser's timing mats, for the demo: the runner's page says it has passed a mat,
// and the server records the official distance and time if the runner's record agrees.
// The phone never writes those fields itself: its token can't (see grantRunner).
export async function POST(req: Request) {
  if (accessManagerUrl()) {
    const body = await req.json().catch(() => null)
    return sharedResponse('timing', { km: body?.km, slug: req.headers.get('x-race-run'), secret: req.headers.get('x-race-key') })
  }
  const slug = req.headers.get('x-race-run') ?? ''
  if (!SLUG_PATTERN.test(slug) || !(await verifyRunnerSecret(slug, req.headers.get('x-race-key') ?? ''))) return fail(403, 'This is not the runner link')
  let km: unknown
  try {
    ;({ km } = await req.json())
  } catch {
    return fail(400, 'Body must be JSON')
  }
  if (typeof km !== 'number' || !TIMING_MATS.includes(km)) return fail(400, `km must be one of ${TIMING_MATS.join(', ')}`)
  try {
    const res = await recordMat(slug, km)
    return Response.json(res, { status: res.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('timing failed', err)
    return fail(500, 'Could not record the mat')
  }
}
