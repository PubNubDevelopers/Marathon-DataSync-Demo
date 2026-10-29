'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type PubNub from 'pubnub'
import QRCode from 'qrcode'
import RaceMap from '@/components/RaceMap'
import DevPanel, { type ActionResult } from '@/components/DevPanel'
import CheerFlash, { type Flash } from '@/components/CheerFlash'
import StravaExport from '@/components/StravaExport'
import { Brand, Headphones, Live, Lock, Stat, initialsOf } from '@/components/ui'
import { apiError, browserUserId, createClient, keepTokenFresh, requestSession, savedName } from '@/lib/client/session'
import { loadRunConfig, saveRunConfig, type RunConfig } from '@/lib/client/run-config'
import { usePresence } from '@/lib/client/presence'
import { speakLine, unlockVoice } from '@/lib/client/voice'
import { recordedClip, type Announcement } from '@/lib/voice-catalog'
import { reportMat } from '@/lib/client/timing'
import { loadTrack, saveTrack } from '@/lib/client/track'
import type { TrackPoint } from '@/lib/gpx'
import { COURSE_KM, courseUpTo, pointAtKm, START } from '@/lib/course'
import { decodePolyline, distanceM, encodePolyline, formatClock, formatKm, formatPace, roundPoint, simplify, type LngLat } from '@/lib/geo'
import { SIM_SPEED, WIND_FROM_KM, advance, simPace, timeTo } from '@/lib/sim'
import {
  CHEER_CLASS,
  RUNNER_CLASS,
  RUNNER_CLASS_VERSION,
  TIMING_MATS,
  applyRecord,
  byKm,
  glideMs,
  isNewer,
  noticesChannel,
  runnerId,
  toCheer,
  type Cheer,
  type CheerEntity,
  type Notice,
  type RunnerEntity,
  type RunnerPayload,
  type SessionResponse,
} from '@/lib/race'

const WRITE_EVERY_MS = 5000 // with GPS. A simulated run writes on every simulator tick, once a second.
const TRAIL_STEP_M = 20
const MAX_ACCURACY_M = 30
const PACE_WINDOW_MS = 30_000
const GPS_LOST_SHOWN_MS = 9000
const EVENT_GRACE_MS = 2000 // how long a write's own response waits for the event before it's shown instead
const REFUSED_SHOWN_MS = 9000
const TRACK_STEP_KM = 0.02 // the simulator's track for the GPX export, a point every 20 m
const TRACK_SAVE_MS = 15_000

type Phase = 'loading' | 'ready' | 'running' | 'finished' | 'error'
type Sync = { at: number; status: number; code?: string }
export type GpsLost = ActionResult & { storedLat?: number }
export type Refused = ActionResult

declare global {
  interface Window {
    // Hooks for scripted demos of a simulated run. They change nothing a real run does.
    __race?: { setSpeed: (n: number) => void; skipTo: (km: number) => void; cheat: () => Promise<Refused | null>; state: () => { km: number; sec: number; phase: Phase; speed: number } }
  }
}

export default function RunnerScreen({ slug }: { slug: string }) {
  const id = runnerId(slug)
  const channel = noticesChannel(slug)

  const [config, setConfig] = useState<RunConfig | null>(null)
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [pubnub, setPubnub] = useState<PubNub | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [km, setKm] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [sync, setSync] = useState<Sync | null>(null)
  const [gpsNote, setGpsNote] = useState('')
  const [cheers, setCheers] = useState<Cheer[]>([])
  const [flash, setFlash] = useState<Flash | null>(null)
  const [pulse, setPulse] = useState(0)
  const [qr, setQr] = useState('')
  const [shared, setShared] = useState(false)
  const [gpsLost, setGpsLost] = useState<GpsLost | null>(null)
  const [refused, setRefused] = useState<Refused | null>(null)
  const [simSec, setSimSec] = useState(0)
  const [follow, setFollow] = useState(true)
  const [ending, setEnding] = useState(false)
  const [voiceNote, setVoiceNote] = useState('')
  const [failedVoices, setFailedVoices] = useState(new Set<string>())
  const lastAnnouncement = useRef<Announcement>('start')
  // The run as DataSync has it, from the same events supporters get. The screen shows
  // this rather than the phone's own numbers, so every phone shows the same run at the
  // same moment. The phone's numbers only decide what to write.
  const [shown, setShown] = useState<RunnerEntity | null>(null)
  const [glide, setGlide] = useState(1000)
  const shownRef = useRef<RunnerEntity | null>(null)

  // Mutable run state the timers read. React state above is for rendering.
  const t = useRef({
    created: false,
    distance: 0, // metres
    last: null as LngLat | null,
    window: [] as { at: number; m: number }[],
    pace: null as number | null,
    pos: null as LngLat | null,
    trail: [] as LngLat[],
    fixAt: null as string | null,
    dirty: false,
    writing: null as Promise<void> | null,
    mode: 'gps' as 'gps' | 'sim',
    startedAt: 0,
    simKm: 0,
    simSec: 0,
    speed: SIM_SPEED,
    windAt: null as number | null, // where a cheer lifted the simulated runner
    stored: 0, // km in the last write DataSync accepted
    mats: new Set<number>(), // timing mats the organiser has recorded
    reporting: false,
    reportAgain: false,
    ended: false,
    cheers: new Map<string, Cheer>(),
    playing: new Set<string>(),
    failedAudio: new Set<string>(),
    // The run with a time on every point, for the GPX export. Only on this phone.
    track: [] as TrackPoint[],
    trackKm: 0, // the simulator's distance and time at the last track point
    trackSec: 0,
    trackSaved: 0,
  })
  const tokens = useRef<ReturnType<typeof keepTokenFresh> | null>(null)
  const dueRef = useRef<() => void>(() => {})
  const phaseRef = useRef<Phase>('loading')
  phaseRef.current = phase
  const wake = useRef<WakeLockSentinel | null>(null)
  const stopTracking = useRef<() => void>(() => {})
  const runnerRef = useRef({ slug, secret: '' })

  const announce = useCallback((say: Announcement) => {
    lastAnnouncement.current = say
    void speakLine({ say }, runnerRef.current).then((result) => setVoiceNote(result.ok ? '' : 'Audio unavailable. Cheers stay visible as text.'))
  }, [])

  const show = useCallback((next: RunnerEntity) => {
    const held = shownRef.current
    if (held && !isNewer(next, held)) return
    setGlide((g) => glideMs(next, held, g))
    shownRef.current = applyRecord(held, next)
    setShown(shownRef.current)
  }, [])

  const keepCheer = useCallback((c: Cheer) => {
    const s = t.current
    const held = s.cheers.get(c.id)
    // A cheer this phone already played stays heard, whatever an older read says.
    if (held?.status === 'heard' && c.status !== 'heard') return
    if (held?.status === 'delivered' && c.status === 'pinned') return
    s.cheers.set(c.id, { ...held, ...c })
    setCheers([...s.cheers.values()].sort(byKm))
  }, [])

  const [supporterUrl, setSupporterUrl] = useState('')
  useEffect(() => setSupporterUrl(`${location.origin}/c/${slug}`), [slug])
  const supporters = usePresence(pubnub, channel)

  // 1. Session. Create the runner's record if it doesn't exist yet, so supporters can
  // follow and leave cheers before the start. Then read every cheer left so far.
  useEffect(() => {
    const hashSecret = new URLSearchParams(location.hash.slice(1)).get('k') ?? undefined
    const stored = loadRunConfig(slug)
    const secret = hashSecret ?? stored?.secret
    if (!secret) {
      setError("This link is for the runner's phone. Supporters follow at the link below.")
      setPhase('error')
      return
    }
    const cfg: RunConfig = stored ?? { name: savedName() || 'Runner', bib: '', mode: 'gps', secret }
    if (!stored) saveRunConfig(slug, cfg)
    setConfig(cfg)
    t.current.mode = cfg.mode
    runnerRef.current = { slug, secret }
    const speed = Number(new URLSearchParams(location.search).get('speed'))
    if (speed > 0 && speed <= 600) t.current.speed = speed

    let client: PubNub | undefined
    let cancelled = false
    const req = { role: 'runner' as const, userId: browserUserId('runner'), slug, secret }
    ;(async () => {
      try {
        const s = await requestSession(req)
        if (cancelled) return
        client = createClient(s)
        tokens.current = keepTokenFresh(client, req, setSession)
        tokens.current.schedule(s.ttlMinutes)
        setSession(s)
        setPubnub(client)

        let existing = await client.dataSync
          .getEntity({ id })
          .then((r) => r.data as RunnerEntity)
          .catch((e) => {
            if (apiError(e).status === 404) return null
            throw e
          })
        if (!existing) {
          const [lng, lat] = START
          const res = await client.dataSync.createEntity({
            id,
            class: RUNNER_CLASS,
            data: { classVersion: RUNNER_CLASS_VERSION, status: 'ready', payload: { name: cfg.name, bib: cfg.bib || null, lat, lng, km: 0, elapsedSec: 0 } },
          })
          existing = res.data as RunnerEntity
        }
        if (cancelled) return
        const p = existing.payload ?? {}
        const s2 = t.current
        s2.created = true
        s2.ended = existing.status === 'finished'
        s2.distance = (p.km ?? 0) * 1000
        s2.simKm = p.km ?? 0
        s2.simSec = p.elapsedSec ?? 0
        setSimSec(s2.simSec)
        setKm(s2.simKm)
        if (p.lat != null && p.lng != null) s2.pos = [p.lng, p.lat]
        s2.trail = decodePolyline(p.trail)
        s2.track = loadTrack(slug)
        s2.trackSaved = s2.track.length
        s2.trackKm = s2.simKm
        s2.trackSec = s2.simSec
        show(existing)
        setPhase(existing.status === 'finished' ? 'finished' : 'ready')

        const list = await client.dataSync.getEntities({ class: CHEER_CLASS, filterFast: `runner == "${slug}"`, limit: 100 })
        for (const e of list.data as CheerEntity[]) {
          const c = toCheer(e)
          if (c) keepCheer(c)
        }
      } catch (e) {
        setError(apiError(e).message ?? 'Could not start the session')
        setPhase('error')
      }
    })()
    return () => {
      cancelled = true
      tokens.current?.stop()
      client?.destroy()
    }
  }, [slug, id, show, keepCheer])

  // The runner's DataSync events, on the entity's ID channel, as supporters get them.
  useEffect(() => {
    if (!pubnub) return
    const sub = pubnub.dataSyncEntity(id).subscription()
    sub.onDataSync = (event) => {
      const change = event.message
      if (change.event === 'delete' || change.data.id !== id) return
      show(change.data as RunnerEntity)
    }
    sub.subscribe()
    return () => sub.unsubscribe()
  }, [pubnub, id, show])

  // 2. A supporter left a cheer: read it through this token's private view. One sent now is
  // already due, so it plays right away; one pinned ahead waits for her.
  useEffect(() => {
    if (!pubnub) return
    const sub = pubnub.channel(channel).subscription()
    sub.onMessage = (event) => {
      const msg = event.message as Notice
      if (msg?.type !== 'pinned' || typeof msg.id !== 'string' || !msg.id.startsWith(`cheer.${slug}.`)) return
      void pubnub.dataSync
        .getEntity({ id: msg.id })
        .then((r) => {
          const c = toCheer(r.data as CheerEntity)
          if (c) keepCheer(c)
          dueRef.current()
        })
        .catch(() => {})
    }
    sub.subscribe()
    return () => sub.unsubscribe()
  }, [pubnub, channel, slug, keepCheer])

  useEffect(() => {
    if (!supporterUrl) return
    QRCode.toString(supporterUrl, { type: 'svg', margin: 0, color: { dark: '#e8ecff', light: '#0000' } }).then(setQr)
  }, [supporterUrl])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Keep the screen on. The browser only gets GPS while the page is in front.
  const keepAwake = useCallback(async () => {
    try {
      wake.current = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      wake.current = null
    }
  }, [])
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && phase === 'running') void keepAwake()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [phase, keepAwake])

  const payload = useCallback((): RunnerPayload => {
    const s = t.current
    const [lng, lat] = s.pos!
    return {
      name: config?.name ?? 'Runner',
      lat: +lat.toFixed(6),
      lng: +lng.toFixed(6),
      km: +(s.distance / 1000).toFixed(3),
      paceSec: s.pace == null ? null : Math.round(s.pace),
      elapsedSec: s.mode === 'sim' ? Math.round(s.simSec) : s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : null,
      fixAt: s.fixAt,
      trail: s.trail.length ? encodePolyline(simplify(s.trail, 4)) : null,
    }
  }, [config])

  // If a write's event hasn't arrived in EVENT_GRACE_MS (events off for the class, or a
  // dropped connection), show what the write returned. A record already shown is skipped.
  const showLate = useCallback((rec: RunnerEntity) => void setTimeout(() => show(rec), EVENT_GRACE_MS), [show])

  // 3. DataSync writes: one PATCH every 5 s with GPS, on every simulator tick in a
  // simulated run. One write at a time: while one is in flight, a regular write is
  // skipped and dirty stays set, so the next tick sends the change.
  const write = useCallback(
    async (status?: 'running' | 'finished') => {
      const s = t.current
      if (status) while (s.writing) await s.writing
      else if (s.writing) return
      if (!pubnub || !s.pos || (!s.dirty && !status)) return
      s.dirty = false
      const p = payload()
      const job = (async () => {
        try {
          const replace: Record<string, unknown> = {
            '/payload/lat': p.lat,
            '/payload/lng': p.lng,
            '/payload/km': p.km,
            '/payload/paceSec': p.paceSec,
            '/payload/elapsedSec': p.elapsedSec,
            '/payload/fixAt': p.fixAt,
            '/payload/trail': p.trail,
          }
          if (status) replace['/status'] = status
          // add, not replace: fields like paceSec aren't stored until the first write has them.
          const res = await pubnub.dataSync.updateEntity({ id, add: replace })
          setSync({ at: Date.now(), status: res.status })
          showLate(res.data as RunnerEntity)
          s.stored = p.km
          void matsRef.current()
        } catch (e) {
          const err = apiError(e)
          setSync({ at: Date.now(), status: err.status, code: err.code })
          s.dirty = true
          if (err.status === 403) await tokens.current?.refresh().catch(() => {})
        }
      })()
      s.writing = job
      await job
      if (s.writing === job) s.writing = null
    },
    [pubnub, id, payload, showLate],
  )
  const writeRef = useRef(write)
  writeRef.current = write

  // 4. Timing mats. Once DataSync holds a distance past a mat, the organiser's timing
  // (/api/timing) records the official distance and time there. If the record hasn't
  // reached it yet, the mat is tried again after the next write.
  const reportMats = useCallback(async () => {
    const s = t.current
    // A final write can arrive while the previous timing request is finishing.
    // Keep that work queued: after the finish there may be no more position writes.
    if (s.reporting) {
      s.reportAgain = true
      return
    }
    s.reporting = true
    try {
      do {
        s.reportAgain = false
        for (const mat of TIMING_MATS) {
          if (s.mats.has(mat) || mat > s.stored + 1e-9) continue
          if (!(await reportMat(mat, runnerRef.current))) break
          s.mats.add(mat)
        }
      } while (s.reportAgain)
    } finally {
      s.reporting = false
    }
  }, [])
  const matsRef = useRef(reportMats)
  matsRef.current = reportMats

  // A phone that loses its GPS fix, under a bridge, say, can send a position with no
  // coordinates, the way an app that writes whatever the last fix was would. It goes
  // out like any other write. The Runner schema says lat can't be null, so DataSync
  // rejects the whole write, and no supporter's map jumps. The dev panel sends one.
  const sendEmptyFix = useCallback(async (): Promise<GpsLost | null> => {
    const s = t.current
    if (!pubnub || !s.created) return null
    while (s.writing) await s.writing
    let result: GpsLost
    const replace = { '/payload/lat': null, '/payload/lng': null, '/payload/km': +(s.distance / 1000).toFixed(3), '/payload/fixAt': new Date().toISOString() }
    try {
      const res = await pubnub.dataSync.updateEntity({ id, replace })
      result = { title: 'updateEntity, lat: null', status: res.status, json: res.data, n: Date.now() }
    } catch (e) {
      const err = apiError(e)
      result = { title: 'updateEntity, lat: null', status: err.status, code: err.code, message: err.message, json: err.body ?? err.message, n: Date.now() }
    }
    // Read the run back: the rejected write must not have replaced the saved position.
    if (result.status === 400) {
      const lat = await pubnub.dataSync
        .getEntity({ id })
        .then((r) => (r.data as RunnerEntity).payload?.lat)
        .catch(() => undefined)
      if (typeof lat === 'number') result = { ...result, storedLat: lat }
    }
    setGpsLost(result)
    return result
  }, [pubnub, id])

  useEffect(() => {
    if (!gpsLost) return
    const timer = setTimeout(() => setGpsLost(null), GPS_LOST_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [gpsLost])

  // A cheat, for demos: the phone records its own finish. Official times come only from
  // the organiser's timing mats, and this phone's token reads and writes the run through
  // the phone projection, which leaves them out. DataSync refuses the whole write.
  const fakeFinish = useCallback(async (): Promise<Refused | null> => {
    const s = t.current
    if (!pubnub || !s.created) return null
    while (s.writing) await s.writing
    const title = 'updateEntity, officialKm: 42.195'
    const add = { '/payload/officialKm': COURSE_KM, '/payload/officialSec': Math.round(s.simSec || (Date.now() - s.startedAt) / 1000) }
    let result: Refused
    try {
      const res = await pubnub.dataSync.updateEntity({ id, add })
      result = { title, status: res.status, json: res.data, n: Date.now() }
    } catch (e) {
      const err = apiError(e)
      result = { title, status: err.status, code: err.code, message: err.message, json: err.body ?? err.message, n: Date.now() }
    }
    setRefused(result)
    return result
  }, [pubnub, id])
  const fakeFinishRef = useRef(fakeFinish)
  fakeFinishRef.current = fakeFinish

  useEffect(() => {
    if (!refused) return
    const timer = setTimeout(() => setRefused(null), REFUSED_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [refused])

  // 5. The words come from this phone's private view. Only completed audio playback
  // marks a cheer heard. A failed attempt stays text and waits for an explicit retry.
  const play = useCallback(
    async (c: Cheer) => {
      const s = t.current
      if (!pubnub || s.playing.has(c.id) || !c.message) return
      s.playing.add(c.id)
      s.failedAudio.delete(c.id)
      setFailedVoices((held) => { const next = new Set(held); next.delete(c.id); return next })
      const display = { id: c.id, from: c.from, text: c.message, km: c.atKm }
      setFlash({ ...display, audio: recordedClip({ from: c.from, message: c.message }) ? 'preparing' : 'text-only', n: Date.now() })
      // A text-only cheer reaches her too: the phone buzzes and the sim gets its lift.
      const arrived = () => {
        if (s.mode === 'sim' && s.windAt == null && c.atKm >= WIND_FROM_KM) s.windAt = s.simKm
        setPulse((n) => n + 1)
        navigator.vibrate?.([120, 60, 120])
      }
      const result = await speakLine({ from: c.from, message: c.message }, runnerRef.current, () => {
        arrived()
        setFlash({ ...display, audio: 'playing', n: Date.now() })
      })
      if (!result.ok && result.reason === 'text-only') arrived()
      if (!result.ok && result.reason === 'unavailable') {
        s.failedAudio.add(c.id)
        setFailedVoices((held) => new Set(held).add(c.id))
        setFlash({ ...display, audio: 'unavailable', n: Date.now() })
        return
      }
      const status = result.ok ? 'heard' : 'delivered'
      setFlash((held) => held?.id === c.id ? { ...held, audio: result.ok ? 'heard' : 'text-only' } : held)
      const heardAt = new Date().toISOString()
      keepCheer({ ...c, status, ...(result.ok ? { heardAt } : {}) })
      // Store where she is first, and wait for DataSync's event for it (it reaches every page at
      // about the same moment), so supporters see her at the cheer's kilometre when it turns heard.
      while (s.writing) await s.writing
      if (!s.ended) {
        s.dirty = true
        await writeRef.current()
        const until = Date.now() + 3000
        while ((shownRef.current?.payload?.km ?? 0) < c.atKm - 0.005 && Date.now() < until) await new Promise((r) => setTimeout(r, 100))
      }
      try {
        await pubnub.dataSync.updateEntity({ id: c.id, replace: { '/status': status }, ...(result.ok ? { add: { '/payload/heardAt': heardAt } } : {}) })
      } catch {
        // The notice below still tells the pages open now.
      }
      const notice: Notice = result.ok ? { type: 'heard', id: c.id, at: heardAt } : { type: 'delivered', id: c.id }
      await pubnub.publish({ channel, message: notice }).catch(() => {})
    },
    [pubnub, channel, keepCheer],
  )
  const playRef = useRef(play)
  playRef.current = play
  const retryCheer = (cheer: Cheer) => {
    if (!t.current.failedAudio.delete(cheer.id)) return
    unlockVoice()
    t.current.playing.delete(cheer.id)
    void playRef.current(cheer)
  }

  const due = useCallback(() => {
    if (phaseRef.current !== 'running') return
    const s = t.current
    const at = s.distance / 1000
    const next = [...s.cheers.values()].filter((c) => c.status === 'pinned' && !s.playing.has(c.id) && c.atKm <= at + 0.005).sort(byKm)[0]
    if (next) void playRef.current(next)
  }, [])
  dueRef.current = due

  const recordPosition = useCallback((p: LngLat, paceSec: number | null) => {
    const s = t.current
    s.pos = p
    s.pace = paceSec
    s.fixAt = new Date().toISOString()
    s.dirty = true
    setKm(s.distance / 1000)
  }, [])

  const startGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsNote('This browser has no GPS access. Try a simulated race.')
      return () => {}
    }
    const watch = navigator.geolocation.watchPosition(
      (fix) => {
        const s = t.current
        const p: LngLat = [fix.coords.longitude, fix.coords.latitude]
        const accuracy = Math.round(fix.coords.accuracy)
        if (accuracy > MAX_ACCURACY_M) {
          setGpsNote(`Weak GPS (±${accuracy} m). Distance counts from ±${MAX_ACCURACY_M} m.`)
          return
        }
        setGpsNote('')
        if (s.last) {
          const d = distanceM(s.last, p)
          if (d < 3) return
          s.distance += d
        }
        s.last = p
        const at = fix.timestamp
        s.track.push([+p[0].toFixed(6), +p[1].toFixed(6), Math.round(at)])
        s.window.push({ at, m: s.distance })
        while (s.window.length > 2 && s.window[1].at <= at - PACE_WINDOW_MS) s.window.shift()
        const first = s.window[0]
        const dm = s.distance - first.m
        const paceSec = dm > 15 ? (at - first.at) / 1000 / (dm / 1000) : null
        const lastPoint = s.trail[s.trail.length - 1]
        if (!lastPoint || distanceM(lastPoint, p) >= TRAIL_STEP_M) s.trail = [...s.trail, roundPoint(p)]
        recordPosition(p, paceSec)
        due()
      },
      (err) => setGpsNote(err.code === err.PERMISSION_DENIED ? 'Location is blocked for this site.' : err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )
    const timer = setInterval(() => void writeRef.current(), WRITE_EVERY_MS)
    return () => {
      clearInterval(timer)
      navigator.geolocation.clearWatch(watch)
    }
  }, [recordPosition, due])

  const finishRun = useCallback(async () => {
    stopTracking.current()
    t.current.ended = true
    t.current.dirty = true
    saveTrack(slug, t.current.track)
    await write('finished')
    void wake.current?.release()
    announce('finish')
    setPhase('finished')
  }, [write, slug, announce])

  const simStep = useCallback(
    (km: number, sec: number) => {
      const s = t.current
      // The track for the GPX export: the course every 20 m since the last point, timed by
      // the simulated race clock from the moment the runner pressed Start.
      if (km > s.trackKm) {
        const t0 = s.startedAt || Date.now()
        const at = (k: number, sc: number): TrackPoint => {
          const [lng, lat] = pointAtKm(k)
          return [+lng.toFixed(6), +lat.toFixed(6), Math.round(t0 + sc * 1000)]
        }
        if (!s.track.length) s.track.push(at(s.trackKm, s.trackSec))
        for (let k = s.trackKm + TRACK_STEP_KM; k < km; k += TRACK_STEP_KM) s.track.push(at(k, s.trackSec + ((sec - s.trackSec) * (k - s.trackKm)) / (km - s.trackKm)))
        s.track.push(at(km, sec))
        s.trackKm = km
        s.trackSec = sec
      }
      s.simKm = km
      s.simSec = sec
      s.distance = km * 1000
      s.trail = courseUpTo(km, 25).map(roundPoint)
      setSimSec(sec)
      recordPosition(pointAtKm(km), simPace(km, s.windAt))
    },
    [recordPosition],
  )

  const startSim = useCallback(() => {
    const s = t.current
    let last = performance.now()
    const tick = () => {
      const nowMs = performance.now()
      const dt = (nowMs - last) / 1000
      last = nowMs
      const next = advance(s.simKm, s.simSec, dt * s.speed, s.windAt)
      simStep(next.km, next.sec)
      if (next.km >= COURSE_KM) {
        void finishRun()
        return
      }
      due()
      void writeRef.current()
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [simStep, finishRun, due])

  // Scripted demos: change the speed, or skip ahead along the course.
  useEffect(() => {
    window.__race = {
      setSpeed: (n) => {
        t.current.speed = Math.max(1, Math.min(600, n))
      },
      skipTo: (target) => {
        const s = t.current
        if (s.mode !== 'sim' || target <= s.simKm) return
        const next = timeTo(s.simKm, s.simSec, Math.min(target, COURSE_KM - 0.01), s.windAt)
        simStep(next.km, next.sec)
        void writeRef.current()
      },
      cheat: () => fakeFinishRef.current(),
      state: () => ({ km: t.current.distance / 1000, sec: t.current.simSec, phase, speed: t.current.speed }),
    }
  }, [phase, simStep])

  // The tap that starts the run also unlocks the voice on iOS.
  const begin = async () => {
    if (!config) return
    unlockVoice()
    const resuming = (shownRef.current?.status ?? 'ready') !== 'ready'
    announce(resuming ? 'resume' : 'start')
    await keepAwake()
    if (!config.startedAt) {
      const next = { ...config, startedAt: Date.now() }
      saveRunConfig(slug, next)
      setConfig(next)
    }
    t.current.startedAt = config.startedAt ?? Date.now()
    if (!t.current.pos) t.current.pos = START
    stopTracking.current = config.mode === 'sim' ? startSim() : startGps()
    setPhase('running')
    t.current.dirty = true
    void write('running')
  }

  useEffect(() => () => stopTracking.current(), [])

  // Keep the recorded track through a reload in the middle of the run.
  useEffect(() => {
    if (phase !== 'running') return
    const persist = () => {
      const s = t.current
      if (s.track.length === s.trackSaved) return
      saveTrack(slug, s.track)
      s.trackSaved = s.track.length
    }
    const hidden = () => { if (document.visibilityState === 'hidden') persist() }
    const timer = setInterval(persist, TRACK_SAVE_MS)
    addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      persist()
      clearInterval(timer)
      removeEventListener('pagehide', persist)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [phase, slug])

  // In a simulated run, G sends another empty GPS fix, for demos on a laptop.
  useEffect(() => {
    if (config?.mode !== 'sim' || phase !== 'running') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'g' || e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return
      void sendEmptyFix()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [config, phase, sendEmptyFix])

  const share = async () => {
    if (navigator.share) await navigator.share({ title: `Cheer ${config?.name ?? 'me'} on`, url: supporterUrl }).catch(() => {})
    else await navigator.clipboard.writeText(supporterUrl)
    setShared(true)
    setTimeout(() => setShared(false), 2000)
  }

  // On screen: the DataSync record.
  const sp = shown?.payload
  const viewLat = sp?.lat
  const viewLng = sp?.lng
  const viewPos = useMemo<LngLat | null>(() => (viewLat != null && viewLng != null ? [viewLng, viewLat] : null), [viewLat, viewLng])
  const viewTrailCode = sp?.trail
  const viewTrail = useMemo(() => decodePolyline(viewTrailCode), [viewTrailCode])
  const viewKm = sp?.km ?? 0
  const elapsed = sp?.elapsedSec != null ? sp.elapsedSec * 1000 : config?.mode === 'sim' ? simSec * 1000 : 0
  const waiting = cheers.filter((c) => c.status === 'pinned')
  const next = waiting.filter((c) => c.atKm >= viewKm - 0.05).sort(byKm)[0]
  const started = phase === 'running' || phase === 'finished'
  const syncLabel = sync
    ? sync.status < 300
      ? `Saved to DataSync ${Math.max(0, Math.round((now - sync.at) / 1000))} s ago`
      : `Last write failed: ${sync.status} ${sync.code ?? ''}`
    : phase === 'finished'
      ? 'Saved to DataSync'
      : 'Not saved yet'

  if (phase === 'error') {
    return (
      <main className="center-screen">
        <Brand />
        <p className="error big">{error}</p>
        <Link className="btn primary" href={`/c/${slug}`}>
          Open the supporters' page
        </Link>
      </main>
    )
  }

  return (
    // data-km: the phone's own distance, ahead of the screen by one DataSync round trip.
    // Scripted demos time their steps by it.
    <main className="runner" data-km={km.toFixed(3)} data-phase={phase}>
      <header className="topbar">
        <Brand sub={config?.bib ? `bib ${config.bib}` : undefined} />
        <div className="topbar-right">
          <Live on={phase === 'running'} label={phase === 'finished' ? 'done' : phase === 'running' ? 'live' : 'ready'} />
        </div>
      </header>

      <div className="runner-grid">
        <section className="runner-map">
          <RaceMap position={viewPos} trailPoints={viewTrail} initials={initialsOf(config?.name)} animateMs={glide} pulse={pulse} view={follow ? 'follow' : 'course'} pins={cheers} />
          {/* Out of the way while a refused write's card covers the bottom of the map. */}
          {!gpsLost && !refused && (
            <button className="map-toggle" onClick={() => setFollow(!follow)}>
              {follow ? 'Whole course' : 'Follow me'}
            </button>
          )}
          {(phase === 'ready' || phase === 'loading') && (
            <div className="tap-to-start">
              <button className="btn primary huge" disabled={phase === 'loading'} onClick={begin} data-action="start">
                {phase === 'loading' ? 'Connecting…' : (shown?.status ?? 'ready') !== 'ready' ? 'Resume' : 'Start'}
              </button>
              <p>
                <Headphones /> Headphones in. Your supporters' cheers play when you reach the spot they picked.
              </p>
            </div>
          )}
          {gpsLost && (
            <div className={`glitch ${gpsLost.status === 400 ? '' : 'warn'}`} key={gpsLost.n} role="status" data-gps-lost={gpsLost.status}>
              <p className="glitch-head mono">
                {gpsLost.status === 400 ? `400 ${gpsLost.code ?? ''}` : `${gpsLost.status || 'No'} response`}
                {config?.mode === 'sim' && <span className="glitch-tag">simulated</span>}
              </p>
              <p className="glitch-title">{gpsLost.status === 400 ? 'Empty GPS fix blocked' : 'The empty fix got through'}</p>
              <p className="glitch-body">
                Your phone sent <code>lat: null</code>.{' '}
                {gpsLost.status === 400 ? "The Runner schema needs a number, so DataSync refused the write. Your supporters' maps didn't jump." : 'Check that the Runner class declares lat as a non-nullable number.'}
                {gpsLost.storedLat != null && (
                  <>
                    {' '}
                    Saved position: <code>lat: {gpsLost.storedLat}</code>.
                  </>
                )}
              </p>
            </div>
          )}
          {refused && (
            <div className={`glitch ${refused.status === 403 ? '' : 'warn'}`} key={refused.n} role="status" data-refused={refused.status}>
              <p className="glitch-head mono">
                {refused.status === 403 ? `403 ${refused.code ?? ''}` : `${refused.status || 'No'} response`}
                {config?.mode === 'sim' && <span className="glitch-tag">simulated</span>}
              </p>
              <p className="glitch-title">{refused.status === 403 ? 'Finish refused' : 'The fake finish got through'}</p>
              <p className="glitch-body">
                Your phone tried to record a finish at <code>km 42.2</code>.{' '}
                {refused.status === 403
                  ? "Official times come only from the race's timing mats, so DataSync refused the write. Your supporters saw nothing."
                  : 'Check that the Runner class leaves officialKm out of the phone projection.'}
              </p>
            </div>
          )}
        </section>

        <section className="runner-panel">
          <div className="stats three">
            <Stat label="Distance" value={started || viewKm > 0 ? formatKm(viewKm) : '0.00'} unit="km" big />
            <Stat label="Pace" value={formatPace(sp?.paceSec)} unit="/km" />
            <Stat label="Time" value={formatClock(elapsed)} />
          </div>
          <p className={`sync mono ${sync && sync.status >= 300 ? 'err' : ''}`} data-supporters={supporters}>
            <span className="sync-dot" /> {syncLabel}
            <span className="sync-who">
              {supporters} following
            </span>
          </p>

          {voiceNote && (
            <p className="voice-unavailable" role="status" data-audio-state="unavailable">
              {voiceNote}{' '}
              <button className="link" data-action="retry-voice" onClick={() => { unlockVoice(); announce(lastAnnouncement.current) }}>Retry audio</button>
            </p>
          )}

          {/* A GPS run ends when the runner says so. The simulator ends itself at the finish line. */}
          {phase === 'running' && config?.mode === 'gps' && (
            <button
              className={`btn small end-run ${ending ? 'danger-ghost' : 'ghost'}`}
              onClick={() => (ending ? void finishRun() : setEnding(true))}
              onBlur={() => setEnding(false)}
              data-action="end"
            >
              {ending ? 'Tap again to end your run' : 'End run'}
            </button>
          )}

          <div className="card cheers-card" data-waiting={waiting.length}>
            <div className="cheers-head">
              <h3>
                <Headphones /> Cheers on your course
              </h3>
              <span className="mono muted">{waiting.length} waiting</span>
            </div>
            {cheers.length === 0 ? (
              <p className="muted small">None yet. Share your link and supporters can pin cheers anywhere on the course.</p>
            ) : (
              <ul className="cheer-list">
                {cheers.map((c) => (
                  <li key={c.id} className={`${c.status === 'heard' ? 'heard' : c.status === 'delivered' ? 'delivered' : ''} ${c === next ? 'next' : ''}`} data-cheer-km={c.atKm} data-audio-state={failedVoices.has(c.id) ? 'unavailable' : c.status === 'delivered' ? 'text-only' : c.status === 'heard' ? 'heard' : 'waiting'}>
                    <span className="cheer-km mono">km {c.atKm.toFixed(1)}</span>
                    <span className="cheer-who">
                      <b>{c.from}</b>
                      {c.status === 'heard' || c.status === 'delivered' || failedVoices.has(c.id) ? <span className="cheer-words">“{c.message}”</span> : <span className="cheer-words muted">{recordedClip({ from: c.from, message: c.message ?? '' }) ? 'plays when you get there' : 'text-only cheer at this kilometre'}</span>}
                      {failedVoices.has(c.id) && <span className="voice-unavailable small">Audio unavailable</span>}
                    </span>
                    {failedVoices.has(c.id) ? (
                      <button className="btn tiny" data-action="retry-cheer" onClick={() => retryCheer(c)}>Retry audio</button>
                    ) : c.status === 'heard' ? <span className="heard-tag">heard</span> : c.status === 'delivered' ? <span className="delivered-tag">text only</span> : <Lock />}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {phase === 'finished' ? (
            <div className="card finished">
              <h2>You finished</h2>
              <p>
                {formatKm(viewKm)} km in {formatClock(elapsed)}. Your supporters got the final numbers.
              </p>
              <StravaExport
                runner={runnerRef.current}
                simulated={config?.mode === 'sim'}
                track={() => t.current.track}
                cheeredBy={[...new Set(cheers.filter((c) => c.status === 'heard' || c.status === 'delivered').map((c) => c.from))]}
              />
              <Link className="btn primary" href="/">
                Back to the race
              </Link>
            </div>
          ) : (
            <div className="card share">
              <div className="share-text">
                <h3>Supporters follow here</h3>
                <p className="mono share-url">
                  {supporterUrl.replace(/^https?:\/\//, '').replace(/\/c\/.*$/, '/c/')}
                  <wbr />
                  {slug}
                </p>
                <button className="btn primary small" onClick={share}>
                  {shared ? 'Link ready' : 'Share link'}
                </button>
              </div>
              {qr && <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />}
            </div>
          )}

          <DevPanel
            role="runner"
            pubnub={pubnub}
            slug={slug}
            token={session?.token}
            subscribeKey={session?.subscribeKey}
            position={viewPos ? { lat: viewPos[1], lng: viewPos[0] } : null}
            onEmptyFix={sendEmptyFix}
            onFakeFinish={fakeFinish}
            sim={config?.mode === 'sim' && phase === 'running' ? { skip: (d) => window.__race?.skipTo(t.current.distance / 1000 + d) } : undefined}
          />
        </section>
      </div>

      <CheerFlash flash={flash} />
    </main>
  )
}
