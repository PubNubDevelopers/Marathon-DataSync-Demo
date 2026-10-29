import { MESSAGE_MAX, SLUG_PATTERN } from '@/lib/race'
import { verifyRunnerSecret } from '@/lib/server/pubnub'
import { BUILT_IN_LINES, normaliseCheer, recordedClip, type Announcement } from '@/lib/voice-catalog'

const PRIVATE = { 'Cache-Control': 'private, no-store' }
const fail = (status: number, error: string) => Response.json({ error }, { status, headers: PRIVATE })
const recorded = (path: string) => new Response(null, { status: 303, headers: { ...PRIVATE, Location: path } })

async function authorised(req: Request) {
  const slug = req.headers.get('x-race-run') ?? ''
  return SLUG_PATTERN.test(slug) && await verifyRunnerSecret(slug, req.headers.get('x-race-key') ?? '')
}

// Compatibility endpoint: current clients play shipped recordings directly.
export async function GET(req: Request) {
  const say = new URL(req.url).searchParams.get('say')
  if (!say || !Object.hasOwn(BUILT_IN_LINES, say)) return fail(400, 'Ask for say=start|resume|finish')
  try {
    if (!(await authorised(req))) return fail(403, "Only the runner's page plays the voice")
    return recorded(recordedClip({ say: say as Announcement })!)
  } catch { return fail(503, 'Could not verify the runner link. Try again.') }
}

// New written text is intentionally text only. This route never calls a TTS provider,
// even when an unrelated API key is present in the server environment.
export async function POST(req: Request) {
  try {
    if (!(await authorised(req))) return fail(403, "Only the runner's page plays the voice")
    const body = (await req.json().catch(() => null)) as { from?: unknown; message?: unknown } | null
    if (typeof body?.from !== 'string' || typeof body?.message !== 'string') return fail(400, 'Send { from, message }')
    const line = normaliseCheer(body.from, body.message)
    if (!line.message || line.message.length > MESSAGE_MAX) return fail(400, `A cheer needs 1 to ${MESSAGE_MAX} characters`)
    const clip = recordedClip(line)
    return clip ? recorded(clip) : Response.json({ mode: 'text-only' }, { headers: PRIVATE })
  } catch { return fail(503, 'Could not verify the runner link. Try again.') }
}
