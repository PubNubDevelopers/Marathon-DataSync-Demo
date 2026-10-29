// Shared names and types for the race: the Runner and Cheer entities, their
// channels, and the session API. Used by the pages, /api/session, and the scripts.

export const RACE_NAME = 'Riverside Marathon'

export const RUNNER_CLASS = 'Runner'
export const RUNNER_CLASS_VERSION = 1
export const CHEER_CLASS = 'Cheer'
export const CHEER_CLASS_VERSION = 1
// The Cheer projection that includes the words. The runner's token and each
// cheer's author read through it; every other supporter reads __default__.
export const PRIVATE_PROJECTION = 'private'
// The Runner projection the runner's phone reads and writes through: everything except
// the official distance and time, which only the organiser's timing writes.
export const PHONE_PROJECTION = 'phone'
// The organiser's timing mats: every 5 km and the finish. Crossing one records the
// official distance and race time in the runner's record.
export const TIMING_MATS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195]

// A runner is addressed by a short random slug. Entity ids and channel names
// come from it. Entity ids can't contain colons, slashes, or whitespace.
export const runnerId = (slug: string) => `runner.${slug}`
export const cheerId = (slug: string, key: string) => `cheer.${slug}.${key}`
// Every cheer for one runner, as an Access Manager pattern.
export const cheerPattern = (slug: string) => `^cheer\\.${slug}\\..+$`
// Pub/Sub notices: "a cheer was pinned", "the runner heard it".
export const noticesChannel = (slug: string) => `cheers.${slug}`

export const SLUG_PATTERN = /^[a-z0-9]{10}$/
// Cheers one supporter can leave for one runner.
export const SUPPORTER_SLOTS = 3
export const MESSAGE_MAX = 120

export type RunnerStatus = 'ready' | 'running' | 'finished'

export type RunnerPayload = {
  name: string
  bib?: string | null
  lat: number
  lng: number
  km: number
  paceSec?: number | null
  elapsedSec?: number | null
  fixAt?: string | null
  // The route so far, as a Google encoded polyline. Every map draws this line.
  trail?: string | null
  // The last timing mat crossed and the race time there. Only the organiser writes these.
  officialKm?: number | null
  officialSec?: number | null
}

export type Stored<P> = {
  id: string
  status?: string
  payload?: Partial<P>
  createdAt?: string
  updatedAt?: string
  eTag?: string
  expiresAt?: string
  createdBy?: string
  modifiedBy?: string
}

export type RunnerEntity = Stored<RunnerPayload>

export type CheerPayload = {
  runner: string
  from: string
  atKm: number
  // Only in the private projection: the runner's and the author's view.
  message?: string
  heardAt?: string | null
}

export type CheerEntity = Stored<CheerPayload>

export type Notice = { type: 'pinned' | 'delivered'; id: string } | { type: 'heard'; id: string; at: string }

// The session API. One route issues tokens for both roles.
export type SessionRequest =
  | { role: 'runner'; userId: string; slug?: string; secret?: string }
  | { role: 'supporter'; userId: string; slug: string }

export type SessionResponse = {
  publishKey: string
  subscribeKey: string
  userId: string
  token: string
  ttlMinutes: number
  role: 'runner' | 'supporter'
  slug: string
  // Only on a new runner session: the secret that proves "I'm the runner".
  secret?: string
  // A supporter's own cheer ids. Their token creates and reads these through the private projection.
  cheerSlots?: string[]
}

// Every phone applies the runner's records the same way, so their screens move together.
// A record counts only if it's newer than the copy on screen; repeats are dropped.
export const isNewer = (next: Stored<unknown>, held: Stored<unknown> | null) =>
  !held?.updatedAt || (!!next.updatedAt && Date.parse(next.updatedAt) > Date.parse(held.updatedAt))

// The map dot glides to each new position over about the time between two records.
export const glideMs = (next: Stored<unknown>, held: Stored<unknown> | null, fallback: number) =>
  held?.updatedAt && next.updatedAt ? Math.min(6000, Math.max(800, (Date.parse(next.updatedAt) - Date.parse(held.updatedAt)) * 0.95)) : fallback

export const applyRecord = <P>(held: Stored<P> | null, next: Stored<P>): Stored<P> => ({
  ...held,
  ...next,
  payload: { ...held?.payload, ...next.payload },
})

// A cheer as a page keeps it. `message` is there only if this page's token reads the private view.
export type Cheer = { id: string; from: string; atKm: number; message?: string; status: string; heardAt?: string | null; mine?: boolean }

export const toCheer = (e: CheerEntity, mine = false): Cheer | null => {
  const p = e.payload
  if (!p || typeof p.atKm !== 'number' || typeof p.from !== 'string') return null
  return { id: e.id, from: p.from, atKm: p.atKm, message: p.message, status: e.status ?? 'pinned', heardAt: p.heardAt ?? null, mine }
}

export const byKm = (a: Cheer, b: Cheer) => a.atKm - b.atKm
