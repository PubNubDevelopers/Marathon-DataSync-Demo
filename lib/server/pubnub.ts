import 'server-only'
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import PubNub from 'pubnub'
import { getToken } from '@vercel/connect'
import { PHONE_PROJECTION, PRIVATE_PROJECTION, SUPPORTER_SLOTS, TIMING_MATS, cheerId, cheerPattern, noticesChannel, runnerId, type RunnerEntity } from '@/lib/race'

export const TOKEN_TTL_MINUTES = 60

export function keys() {
  const publishKey = process.env.PUBNUB_PUBLISH_KEY
  const subscribeKey = process.env.PUBNUB_SUBSCRIBE_KEY
  if (!publishKey || !subscribeKey) throw new Error('Set PUBNUB_PUBLISH_KEY and PUBNUB_SUBSCRIBE_KEY')
  return { publishKey, subscribeKey }
}

// The Secret Key comes from Vercel Connect at request time when a connector is
// configured, and from .env.local in local dev. It never leaves this file.
async function secretKey(): Promise<string> {
  const connector = process.env.PUBNUB_CONNECTOR
  if (connector) return getToken(connector, { subject: { type: 'app' } })
  const key = process.env.PUBNUB_SECRET_KEY
  if (!key) throw new Error('Set PUBNUB_CONNECTOR (Vercel Connect) or PUBNUB_SECRET_KEY (local dev)')
  return key
}

let cached: { secret: string; client: PubNub } | undefined

async function serverClient() {
  const secret = await secretKey()
  if (cached?.secret !== secret) {
    cached = { secret, client: new PubNub({ ...keys(), secretKey: secret, userId: 'race-server' }) }
  }
  return cached
}

export function newSlug() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join('')
}

// The runner secret is an HMAC of the slug, so there's no database of runners.
// Whoever holds the runner link (/run/<slug>#k=<secret>) can write the run.
function runnerSecret(secret: string, slug: string) {
  return createHmac('sha256', secret).update(`race-runner:${slug}`).digest('base64url').slice(0, 22)
}

export async function issueRunnerSecret(slug: string) {
  const { secret } = await serverClient()
  return runnerSecret(secret, slug)
}

export async function verifyRunnerSecret(slug: string, given: string) {
  const expected = Buffer.from(await issueRunnerSecret(slug))
  const actual = Buffer.from(given)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// A supporter's cheer ids for one runner: cheer.<slug>.<key>-1 to -3, where the key
// comes from their user id. The same person gets the same ids on every visit.
export function cheerSlots(slug: string, userId: string) {
  const key = 's' + createHash('sha256').update(`${slug}:${userId}`).digest('hex').slice(0, 8)
  return Array.from({ length: SUPPORTER_SLOTS }, (_, i) => cheerId(slug, `${key}-${i + 1}`))
}

const channels = (slug: string) => ({
  // DataSync events for the runner arrive on the entity's ID channel.
  [runnerId(slug)]: { read: true },
  [noticesChannel(slug)]: { read: true, write: true },
  [`${noticesChannel(slug)}-pnpres`]: { read: true },
})

// Runner: create, read, and update their own run through the phone projection, which
// leaves out the official distance and time. Read every cheer left for them through
// the private projection, so the words can be played, and mark them heard.
export async function grantRunner(userId: string, slug: string) {
  const { client } = await serverClient()
  const pattern = cheerPattern(slug)
  return client.grantToken({
    ttl: TOKEN_TTL_MINUTES,
    authorizedUserId: userId,
    resources: {
      dataSync: { entities: { [runnerId(slug)]: { create: true, get: true, update: true } } },
      channels: channels(slug),
    },
    patterns: { dataSync: { entities: { [pattern]: { get: true, update: true } } } },
    dataSyncProjections: {
      resources: { entities: { [runnerId(slug)]: PHONE_PROJECTION } },
      patterns: { entities: { [pattern]: PRIVATE_PROJECTION } },
    },
  })
}

export type MatResult = { status: 200 | 409; officialKm?: number | null; officialSec?: number | null; error?: string }

// The organiser's timing: a runner crossed a mat, so the official distance and race time
// go into their record. This server's own client writes them; no phone token can.
// In the demo it stands in for the chip-timing mats, and it trusts the distance the
// runner's record already holds, so a mat counts only once the record has reached it.
export async function recordMat(slug: string, mat: number): Promise<MatResult> {
  if (!TIMING_MATS.includes(mat)) return { status: 409, error: 'There is no timing mat there' }
  const { client } = await serverClient()
  const id = runnerId(slug)
  const run = (await client.dataSync.getEntity({ id })).data as RunnerEntity
  const p = run.payload ?? {}
  if ((p.officialKm ?? 0) >= mat) return { status: 200, officialKm: p.officialKm, officialSec: p.officialSec }
  if ((p.km ?? 0) < mat - 0.01) return { status: 409, error: "The runner hasn't reached this mat" }
  // The record is a moment past the mat: take back the time it took to run the rest.
  const sec = Math.max(0, Math.round((p.elapsedSec ?? 0) - ((p.km ?? mat) - mat) * (p.paceSec ?? 360)))
  const res = await client.dataSync.updateEntity({ id, add: { '/payload/officialKm': mat, '/payload/officialSec': sec } })
  const stored = (res.data as RunnerEntity).payload
  return { status: 200, officialKm: stored?.officialKm, officialSec: stored?.officialSec }
}

// Supporter: read the run and every cheer through the default projection, so
// other people's words never reach them. Their own cheer slots are exact
// resources, and an exact match wins over the pattern: they create and read
// those through the private projection.
export async function grantSupporter(userId: string, slug: string) {
  const { client } = await serverClient()
  const slots = cheerSlots(slug, userId)
  const own = Object.fromEntries(slots.map((id) => [id, { create: true, get: true, update: true }]))
  const token = await client.grantToken({
    ttl: TOKEN_TTL_MINUTES,
    authorizedUserId: userId,
    resources: {
      dataSync: { entities: { [runnerId(slug)]: { get: true }, ...own } },
      channels: channels(slug),
    },
    patterns: { dataSync: { entities: { [cheerPattern(slug)]: { get: true } } } },
    dataSyncProjections: { resources: { entities: Object.fromEntries(slots.map((id) => [id, PRIVATE_PROJECTION])) } },
  })
  return { token, slots }
}
