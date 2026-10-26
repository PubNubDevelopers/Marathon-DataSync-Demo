import { createHash } from 'node:crypto'
import { MESSAGE_MAX, SLUG_PATTERN } from '@/lib/race'
import { verifyRunnerSecret } from '@/lib/server/pubnub'

// The voice in the runner's headphones: ElevenLabs, the same voice the demo video uses.
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL' // Sarah: mature, reassuring
const MODEL_ID = 'eleven_v4_turbo'
const LINES = {
  start: "You're on. Your supporters can cheer now.",
  resume: "Back on. Your supporters' cheers will play here.",
  finish: 'You finished. Well done!',
} as const
// A supporter's name as it's read out.
const NAME = /^[\p{L}\p{M}' .-]{1,24}$/u
// New lines one runner can have made, per server instance. Repeats come from the cache.
const PER_RUN_PER_HOUR = 40

const made = new Map<string, number[]>()
const cache = new Map<string, ArrayBuffer>()

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}

// What's read out for a cheer. Plain text only: control characters and anything
// that looks like markup are dropped.
function cheerLine(from: string, message: string) {
  const name = from.replace(/\s+/g, ' ').trim()
  const words = message.replace(/[\u0000-\u001f<>{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MESSAGE_MAX)
  return `From ${NAME.test(name) ? name : 'a supporter'}. ${words}`
}

async function authorised(req: Request) {
  const slug = req.headers.get('x-race-run') ?? ''
  if (!SLUG_PATTERN.test(slug) || !(await verifyRunnerSecret(slug, req.headers.get('x-race-key') ?? ''))) return null
  return slug
}

async function speak(slug: string, text: string) {
  const key = createHash('sha256').update(`${VOICE_ID}:${MODEL_ID}:${text}`).digest('hex')
  const hit = cache.get(key)
  if (hit) return audio(hit)
  const hour = Date.now() - 3_600_000
  const recent = (made.get(slug) ?? []).filter((t) => t > hour)
  if (recent.length >= PER_RUN_PER_HOUR) return fail(429, 'Too many new voice lines for this runner')
  made.set(slug, [...recent, Date.now()])

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return fail(503, 'No ELEVENLABS_API_KEY on the server')
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL_ID }),
  })
  if (!res.ok) return fail(502, `ElevenLabs answered ${res.status}`)
  const body = await res.arrayBuffer()
  if (cache.size > 500) cache.clear()
  cache.set(key, body)
  return audio(body)
}

const audio = (body: ArrayBuffer) => new Response(body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400' } })

// GET /api/voice?say=start|resume|finish
export async function GET(req: Request) {
  const say = new URL(req.url).searchParams.get('say')
  if (!say || !(say in LINES)) return fail(400, `Ask for say=${Object.keys(LINES).join('|')}`)
  const slug = await authorised(req)
  if (!slug) return fail(403, "Only the runner's page plays the voice")
  return speak(slug, LINES[say as keyof typeof LINES])
}

// POST /api/voice { from, message }
// The runner's page sends the words it read through its own token: the private
// projection of the Cheer. Headers x-race-run and x-race-key: the slug and the
// secret in the runner's link. Returns audio/mpeg.
export async function POST(req: Request) {
  const slug = await authorised(req)
  if (!slug) return fail(403, "Only the runner's page plays the voice")
  const body = (await req.json().catch(() => null)) as { from?: unknown; message?: unknown } | null
  if (typeof body?.from !== 'string' || typeof body?.message !== 'string' || !body.message.trim()) return fail(400, 'Send { from, message }')
  return speak(slug, cheerLine(body.from, body.message))
}
