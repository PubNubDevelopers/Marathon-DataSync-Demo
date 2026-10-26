// End-to-end check against real DataSync. Run it after setup:class and after turning
// on events for Runner v1 and Cheer v1 in the Portal:
//
//   npm run check
//
// It grants tokens the same way /api/session does (a runner and two supporters,
// Mum and Sam) and checks: the stored run, a cheer's message in the private
// projection only, listing cheers through each token, supporters' writes refused,
// the empty GPS fix rejected, a phone's fake finish refused while the organiser's
// timing writes the official time, and one REST PATCH reaching a subscribed supporter.
import { createHash } from 'node:crypto'
import PubNub from 'pubnub'

const { PUBNUB_PUBLISH_KEY: publishKey, PUBNUB_SUBSCRIBE_KEY: subscribeKey, PUBNUB_SECRET_KEY: secretKey } = process.env
if (!publishKey || !subscribeKey || !secretKey) {
  console.error('Set PUBNUB_PUBLISH_KEY, PUBNUB_SUBSCRIBE_KEY and PUBNUB_SECRET_KEY in .env.local first.')
  process.exit(1)
}

const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
const slug = Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
const runnerId = `runner.${slug}`
const pattern = `^cheer\\.${slug}\\..+$`
const notices = `cheers.${slug}`
const slotsOf = (userId) => {
  const key = 's' + createHash('sha256').update(`${slug}:${userId}`).digest('hex').slice(0, 8)
  return [1, 2, 3].map((i) => `cheer.${slug}.${key}-${i}`)
}

const results = []
const record = (ok, name, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`)
}
const errorOf = (e) => ({ status: e?.status?.statusCode, code: e?.status?.errorData?.errors?.[0]?.errorCode, body: e?.status?.errorData })

const server = new PubNub({ publishKey, subscribeKey, secretKey, userId: 'race-check' })
const channels = { [runnerId]: { read: true }, [notices]: { read: true, write: true } }

const runnerToken = await server.grantToken({
  ttl: 10,
  authorizedUserId: 'check-runner',
  resources: { dataSync: { entities: { [runnerId]: { create: true, get: true, update: true } } }, channels },
  patterns: { dataSync: { entities: { [pattern]: { get: true, update: true } } } },
  dataSyncProjections: { resources: { entities: { [runnerId]: 'phone' } }, patterns: { entities: { [pattern]: 'private' } } },
})
const supporterToken = (userId) => {
  const slots = slotsOf(userId)
  return server.grantToken({
    ttl: 10,
    authorizedUserId: userId,
    resources: { dataSync: { entities: { [runnerId]: { get: true }, ...Object.fromEntries(slots.map((s) => [s, { create: true, get: true, update: true }])) } }, channels },
    patterns: { dataSync: { entities: { [pattern]: { get: true } } } },
    dataSyncProjections: { resources: { entities: Object.fromEntries(slots.map((s) => [s, 'private'])) } },
  })
}

const client = (userId, token) => {
  const pn = new PubNub({ publishKey, subscribeKey, userId })
  pn.setToken(token)
  return pn
}
const maya = client('check-runner', runnerToken)
const mum = client('supporter-check-mum', await supporterToken('supporter-check-mum'))
const sam = client('supporter-check-sam', await supporterToken('supporter-check-sam'))
const mumCheer = slotsOf('supporter-check-mum')[0]
const words = 'This is where you said it gets hard. You have done harder things.'

// 1. The runner registers: the record exists before the start.
try {
  const res = await maya.dataSync.createEntity({ id: runnerId, class: 'Runner', data: { classVersion: 1, status: 'ready', payload: { name: 'Check', bib: '4127', lat: 52.2395, lng: 21.0455, km: 0, elapsedSec: 0 } } })
  record(res.data.status === 'ready', 'Runner creates the record (status ready)', runnerId)
} catch (e) {
  record(false, 'Runner creates the record', JSON.stringify(errorOf(e)))
}

// 2. Mum pins a cheer through her own slot.
try {
  const res = await mum.dataSync.createEntity({ id: mumCheer, class: 'Cheer', data: { classVersion: 1, status: 'pinned', payload: { runner: slug, from: 'Mum', atKm: 32, message: words } } })
  record(res.data.payload.message === words, "Mum pins a cheer at km 32 and reads her own words back", mumCheer)
} catch (e) {
  record(false, 'Mum pins a cheer', JSON.stringify(errorOf(e)))
}

// 3. Projections: Sam gets who and where, the runner gets the words too.
try {
  const s = (await sam.dataSync.getEntity({ id: mumCheer })).data.payload
  record(!('message' in s) && s.from === 'Mum' && s.atKm === 32, "Sam reads Mum's cheer without the message", JSON.stringify(s))
} catch (e) {
  record(false, "Sam reads Mum's cheer", JSON.stringify(errorOf(e)))
}
try {
  const r = (await maya.dataSync.getEntity({ id: mumCheer })).data.payload
  record(r.message === words, "The runner reads Mum's cheer with the message")
} catch (e) {
  record(false, "The runner reads Mum's cheer", JSON.stringify(errorOf(e)))
}

// 4. Listing applies each token's projection to every item.
try {
  const [asSam, asMaya] = await Promise.all([sam, maya].map((c) => c.dataSync.getEntities({ class: 'Cheer', filterFast: `runner == "${slug}"` })))
  const s = asSam.data.find((c) => c.id === mumCheer)?.payload
  const r = asMaya.data.find((c) => c.id === mumCheer)?.payload
  record(!!s && !('message' in s) && r?.message === words, 'getEntities lists the cheer for both, words only for the runner')
} catch (e) {
  record(false, 'getEntities', JSON.stringify(errorOf(e)))
}

// 5. Access Manager: Sam can't change Mum's cheer or the run.
for (const [name, call] of [
  ["Sam can't edit Mum's cheer", () => sam.dataSync.updateEntity({ id: mumCheer, replace: { '/payload/atKm': 5 } })],
  ["Sam can't write the run", () => sam.dataSync.updateEntity({ id: runnerId, replace: { '/payload/km': 42 } })],
]) {
  try {
    await call()
    record(false, name, 'the write went through')
  } catch (e) {
    const err = errorOf(e)
    record(err.status === 403, name, `${err.status}`)
  }
}

// 6. Schema validation: the empty GPS fix.
try {
  await maya.dataSync.updateEntity({ id: runnerId, replace: { '/payload/lat': null, '/payload/lng': null } })
  record(false, 'An empty GPS fix (lat: null) is rejected', 'the write went through')
} catch (e) {
  const err = errorOf(e)
  const stored = (await maya.dataSync.getEntity({ id: runnerId })).data.payload.lat
  record(err.status === 400 && err.code === 'DS-0650' && stored === 52.2395, 'An empty GPS fix (lat: null) is rejected and the saved position stays', `${err.status} ${err.code}, lat still ${stored}`)
}

// 7. Field-level permissions on the run: official times are the organiser's.
try {
  await maya.dataSync.updateEntity({ id: runnerId, add: { '/payload/officialKm': 42.195, '/payload/officialSec': 7200 } })
  record(false, "The runner's phone can't record its own finish", 'the write went through')
} catch (e) {
  const err = errorOf(e)
  record(err.status === 403, "The runner's phone can't record its own finish (officialKm is outside the phone projection)", `${err.status} ${err.code ?? ''}`)
}
try {
  await server.dataSync.updateEntity({ id: runnerId, add: { '/payload/officialKm': 5, '/payload/officialSec': 1830 } })
  const s = (await sam.dataSync.getEntity({ id: runnerId })).data.payload
  const r = (await maya.dataSync.getEntity({ id: runnerId })).data.payload
  record(s.officialKm === 5 && !('officialKm' in r), "The organiser's timing writes the official time; supporters read it, the phone's projection leaves it out", `Sam: ${s.officialKm} km at ${s.officialSec} s`)
} catch (e) {
  record(false, "The organiser's timing writes the official time", JSON.stringify(errorOf(e)))
}

// 8. One REST PATCH, and a subscribed supporter gets the event.
{
  const got = new Promise((resolve) => {
    const sub = sam.dataSyncEntity(runnerId).subscription()
    sub.onDataSync = (event) => {
      if (event.message?.data?.payload?.lat === 52.2412) resolve(event.message)
    }
    sub.subscribe()
    setTimeout(() => resolve(null), 15000)
  })
  await new Promise((r) => setTimeout(r, 2500))
  const url = `https://ps.pndsn.com/v1/datasync/subkeys/${subscribeKey}/entities/${runnerId}?auth=${encodeURIComponent(runnerToken)}&uuid=check-runner`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify([
      { op: 'replace', path: '/payload/lat', value: 52.2412 },
      { op: 'replace', path: '/payload/km', value: 0.4 },
      { op: 'replace', path: '/status', value: 'running' },
    ]),
  })
  const event = await got
  record(res.status === 200 && !!event, 'One REST PATCH reaches a subscribed supporter', `PATCH ${res.status}, event ${event ? `${event.event} at km ${event.data.payload.km}` : 'not received in 15 s (are Runner v1 events on?)'}`)
}

// 9. The runner marks the cheer heard.
try {
  const res = await maya.dataSync.updateEntity({ id: mumCheer, replace: { '/status': 'heard' }, add: { '/payload/heardAt': new Date().toISOString() } })
  record(res.data.status === 'heard', 'The runner marks the cheer heard')
} catch (e) {
  record(false, 'The runner marks the cheer heard', JSON.stringify(errorOf(e)))
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
