'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type PubNub from 'pubnub'
import RaceMap from '@/components/RaceMap'
import DevPanel from '@/components/DevPanel'
import { Brand, Headphones, Live, Lock, Stat, initialsOf } from '@/components/ui'
import { apiError, browserUserId, createClient, keepTokenFresh, requestSession, saveName, savedName } from '@/lib/client/session'
import { usePresence } from '@/lib/client/presence'
import { COURSE_KM } from '@/lib/course'
import { PUBLIC_CHEERS, recordedClip } from '@/lib/voice-catalog'
import { agoLabel, decodePolyline, formatClock, formatKm, formatPace, type LngLat } from '@/lib/geo'
import {
  CHEER_CLASS,
  CHEER_CLASS_VERSION,
  MESSAGE_MAX,
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
  type SessionResponse,
} from '@/lib/race'

// A reload brings the run back. A first visit just loads it.
const reloaded = () => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload'

export default function SupporterScreen({ slug }: { slug: string }) {
  const id = runnerId(slug)
  const channel = noticesChannel(slug)

  const [name, setName] = useState('')
  const [askName, setAskName] = useState(false)
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [pubnub, setPubnub] = useState<PubNub | null>(null)
  const [run, setRun] = useState<RunnerEntity | null>(null)
  const [state, setState] = useState<'loading' | 'waiting' | 'live' | 'error'>('loading')
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState('')
  const [glide, setGlide] = useState(1000)
  const [lastEvent, setLastEvent] = useState<unknown>(undefined)
  const [cheers, setCheers] = useState<Cheer[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [restored, setRestored] = useState<'Loaded' | 'Restored' | null>(null)
  const [composing, setComposing] = useState(false)
  const [draftKm, setDraftKm] = useState<number | null>(null)
  const [kmText, setKmText] = useState('')
  const [text, setText] = useState('')
  const [pinning, setPinning] = useState(false)
  // 'now': the cheer plays as soon as it arrives, where she is. 'pin': it waits at a kilometre ahead.
  const [mode, setMode] = useState<'now' | 'pin'>('now')
  const [pinError, setPinError] = useState('')
  const [follow, setFollow] = useState(true)
  const runRef = useRef<RunnerEntity | null>(null)
  const cheersRef = useRef(new Map<string, Cheer>())
  const slots = useRef<string[]>([])
  const nameRef = useRef('')

  useEffect(() => {
    const n = savedName()
    setName(n)
    nameRef.current = n
    if (!n) setAskName(true)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // When the phone loses its connection, say so, and keep the last position on the map.
  useEffect(() => {
    const down = () => setOffline(true)
    const up = () => setOffline(false)
    if (!navigator.onLine) down()
    addEventListener('offline', down)
    addEventListener('online', up)
    return () => {
      removeEventListener('offline', down)
      removeEventListener('online', up)
    }
  }, [])

  const apply = useCallback((next: RunnerEntity) => {
    const prev = runRef.current
    if (prev && !isNewer(next, prev)) return
    setGlide((g) => glideMs(next, prev, g))
    const merged = applyRecord(prev, next)
    runRef.current = merged
    setRun(merged)
    setState('live')
  }, [])

  const keepCheer = useCallback((c: Cheer) => {
    const held = cheersRef.current.get(c.id)
    if (held?.status === 'heard' && c.status !== 'heard') return
    if (held?.status === 'delivered' && c.status === 'pinned') return
    cheersRef.current.set(c.id, { ...held, ...c, mine: slots.current.includes(c.id) })
    setCheers([...cheersRef.current.values()].sort(byKm))
  }, [])

  // The stored state: the run and every cheer on the course. On a reload this is the
  // recovery, because events sent while the page was gone aren't sent again.
  const load = useCallback(
    async (client: PubNub, first = false) => {
      try {
        const res = await client.dataSync.getEntity({ id })
        runRef.current = null
        apply(res.data as RunnerEntity)
        if (first) setRestored(reloaded() ? 'Restored' : 'Loaded')
      } catch (e) {
        const err = apiError(e)
        if (err.status === 404) setState((s) => (s === 'live' ? s : 'waiting'))
        else {
          setError(err.message ?? 'Could not load the run')
          setState('error')
        }
      }
      try {
        const list = await client.dataSync.getEntities({ class: CHEER_CLASS, filterFast: `runner == "${slug}"`, limit: 100 })
        for (const e of list.data as CheerEntity[]) {
          const c = toCheer(e)
          if (c) keepCheer(c)
        }
      } catch {
        // The run still shows. Cheers arrive with the next notice.
      }
    },
    [id, slug, apply, keepCheer],
  )

  useEffect(() => {
    let client: PubNub | undefined
    let tokens: ReturnType<typeof keepTokenFresh> | undefined
    let cancelled = false
    const req = { role: 'supporter' as const, userId: browserUserId('supporter'), slug }
    ;(async () => {
      try {
        const s = await requestSession(req)
        if (cancelled) return
        client = createClient(s)
        slots.current = s.cheerSlots ?? []
        tokens = keepTokenFresh(client, req, setSession)
        tokens.schedule(s.ttlMinutes)
        setSession(s)
        setPubnub(client)

        // Events for this runner arrive on the entity's ID channel.
        const runSub = client.dataSyncEntity(id).subscription()
        runSub.onDataSync = (event) => {
          const change = event.message
          setLastEvent(change)
          if (change.event === 'delete' || change.data.id !== id) return
          apply(change.data as RunnerEntity)
        }
        runSub.subscribe()

        // After a reconnect, events sent while offline are gone. Fetch again.
        client.addListener({
          status: (st) => {
            if (st.category === 'PNNetworkDownCategory') setOffline(true)
            if (st.category === 'PNNetworkUpCategory' || st.category === 'PNReconnectedCategory') setOffline(false)
            if (st.category === 'PNReconnectedCategory') void load(client!)
          },
        })

        await load(client, true)
      } catch (e) {
        setError((e as Error).message)
        setState('error')
      }
    })()
    return () => {
      cancelled = true
      tokens?.stop()
      client?.destroy()
    }
  }, [slug, id, apply, load])

  // Notices from the other pages: a new pin, or the runner heard one.
  useEffect(() => {
    if (!pubnub) return
    const sub = pubnub.channel(channel).subscription()
    sub.onMessage = (event) => {
      const msg = event.message as Notice
      if (typeof msg?.id !== 'string' || !msg.id.startsWith(`cheer.${slug}.`)) return
      if (msg.type === 'heard') {
        const held = cheersRef.current.get(msg.id)
        if (held) keepCheer({ ...held, status: 'heard', heardAt: msg.at })
      } else if (msg.type === 'delivered') {
        const held = cheersRef.current.get(msg.id)
        if (held) keepCheer({ ...held, status: 'delivered' })
      } else if (msg.type === 'pinned') {
        // Read it through this token: someone else's cheer comes without its message.
        void pubnub.dataSync
          .getEntity({ id: msg.id })
          .then((r) => {
            const c = toCheer(r.data as CheerEntity)
            if (c) keepCheer(c)
          })
          .catch(() => {})
      }
    }
    sub.subscribe()
    return () => sub.unsubscribe()
  }, [pubnub, channel, slug, keepCheer])

  const supporters = usePresence(pubnub, channel)

  const p = run?.payload
  const runner = p?.name ?? 'your runner'
  const recordedCheers = PUBLIC_CHEERS.filter((line) => !line.forRunner || line.forRunner === runner.trim())
  const draftRecorded = !!recordedClip({ from: name, message: text })
  const lat = p?.lat
  const lng = p?.lng
  const pos = useMemo<LngLat | null>(() => (lat != null && lng != null ? [lng, lat] : null), [lat, lng])
  const trailPoints = useMemo(() => decodePolyline(p?.trail), [p?.trail])
  const status = run?.status ?? 'ready'
  const finished = status === 'finished'
  const notStarted = status === 'ready'
  const atKm = p?.km ?? 0
  const elapsed = (p?.elapsedSec ?? 0) * 1000
  const stale = run?.updatedAt && status === 'running' ? now - Date.parse(run.updatedAt) > 60_000 : false
  const mine = cheers.filter((c) => c.mine)
  const free = slots.current.filter((s) => !cheersRef.current.has(s))
  // A cheer waiting further along the course. One sent now (at her kilometre) is about to play.
  const nextMine = mine.filter((c) => c.status === 'pinned' && c.atKm > atKm + 0.05).sort(byKm)[0]
  const minsTo = (km: number) => (p?.paceSec ? Math.max(1, Math.round(((km - atKm) * p.paceSec) / 60)) : null)
  const running = status === 'running'
  // Slower than her average so far by more than 5%: the moment a cheer helps.
  const slowing = running && atKm > 1 && !!p?.paceSec && !!p?.elapsedSec && p.paceSec > (p.elapsedSec / atKm) * 1.05

  const openComposer = (km?: number) => {
    if (!nameRef.current) {
      setAskName(true)
      return
    }
    setPinError('')
    setComposing(true)
    const live = km == null && running
    setMode(live ? 'now' : 'pin')
    if (!live) setFollow(false)
    const start = km ?? draftKm
    setDraftKm(start ?? null)
    setKmText(start != null ? start.toFixed(1) : '')
  }

  const pickKm = (km: number) => {
    const k = Math.max(0, Math.min(COURSE_KM, Math.round(km * 10) / 10))
    setDraftKm(k)
    setKmText(k.toFixed(1))
  }

  // One cheer: a Cheer entity (who, where, the words in the private projection), then a notice
  // on the runner's channel so every page reads it. Sent now, it's at her current kilometre, so
  // her phone plays it as soon as it arrives.
  const leave = async (km: number | null) => {
    if (!pubnub || km == null || !text.trim()) return
    const slot = free[0]
    if (!slot) {
      setPinError(`You've left ${slots.current.length} cheers, the most one supporter can.`)
      return
    }
    setPinning(true)
    setPinError('')
    try {
      const res = await pubnub.dataSync.createEntity({
        id: slot,
        class: CHEER_CLASS,
        data: { classVersion: CHEER_CLASS_VERSION, status: 'pinned', payload: { runner: slug, from: nameRef.current, atKm: km, message: text.trim() } },
      })
      const c = toCheer(res.data as CheerEntity, true)
      if (c) keepCheer(c)
      await pubnub.publish({ channel, message: { type: 'pinned', id: slot } satisfies Notice })
      setComposing(false)
      setText('')
      setDraftKm(null)
      setFollow(true)
    } catch (e) {
      const err = apiError(e)
      setPinError(err.status === 409 ? 'That cheer slot is taken. Reload and try again.' : `${err.status || ''} ${err.code ?? ''} ${err.message ?? 'Could not send the cheer'}`.trim())
    } finally {
      setPinning(false)
    }
  }

  return (
    <main className="supporter" data-state={state} data-offline={offline ? '1' : '0'} data-km={atKm.toFixed(3)}>
      <section className="supporter-map">
        <RaceMap
          position={notStarted && composing ? null : pos}
          trailPoints={trailPoints}
          animateMs={glide}
          initials={initialsOf(p?.name)}
          pins={cheers}
          draftKm={composing && mode === 'pin' ? draftKm : null}
          view={(composing && mode === 'pin') || !follow ? 'course' : 'follow'}
          onPick={composing && mode === 'pin' ? pickKm : undefined}
        />
        <header className="topbar floating">
          <Brand />
          <div className="topbar-right">
            <Live on={state === 'live' && status === 'running' && !stale && !offline} label={finished ? 'finished' : offline ? 'offline' : notStarted ? 'not started' : stale ? 'quiet' : 'live'} />
          </div>
        </header>
        {!composing && (
          <button className="map-toggle" onClick={() => setFollow(!follow)}>
            {follow ? 'Whole course' : `Follow ${runner}`}
          </button>
        )}
        {/* The organiser's timing: the last mat crossed. No phone can write these fields. */}
        {!composing && p?.officialKm != null && p.officialSec != null && (
          <p className="official-chip mono" data-official={p.officialKm}>
            {p.officialKm >= COURSE_KM - 0.01 ? 'Official finish' : `Timing mat ${p.officialKm} km`} · {formatClock(p.officialSec * 1000)}
          </p>
        )}
        {offline && (
          <div className="offline-banner mono" role="status" data-banner="offline">
            Connection lost · showing last received position
          </div>
        )}
        {restored && run && !offline && (
          <div className="restored mono" data-banner="restored" onAnimationEnd={() => setRestored(null)}>
            {restored} from DataSync · {formatKm(atKm)} km
          </div>
        )}
        {finished && <div className="finish-banner">{runner} finished!</div>}
        {state === 'waiting' && (
          <div className="map-overlay">
            <p>Waiting for the runner…</p>
            <p className="muted">This page updates by itself when they register.</p>
          </div>
        )}
        {state === 'error' && (
          <div className="map-overlay">
            <p className="error">{error}</p>
          </div>
        )}
      </section>

      <section className="supporter-sheet">
        {composing ? (
          <div className="composer" data-composer="1" data-mode={mode}>
            <div className="composer-head">
              <h2>A cheer for {runner}</h2>
              <button className="btn tiny" onClick={() => setComposing(false)}>
                Cancel
              </button>
            </div>
            <label className="field">
              <span>Your cheer</span>
              <textarea data-field="message" value={text} maxLength={MESSAGE_MAX} rows={3} placeholder="You've got this!" onChange={(e) => setText(e.target.value)} />
              <span className="counter mono">
                {text.length}/{MESSAGE_MAX}
              </span>
            </label>
            {recordedCheers.length > 0 && (
              <div className="recorded-cheers">
                <span className="small muted">Try a recorded cheer</span>
                <div>
                  {recordedCheers.map((line) => <button key={line.id} type="button" className="btn tiny" data-action="recorded-cheer" data-clip-id={line.id} title={line.message} onClick={() => setText(line.message)}>{line.label}</button>)}
                </div>
              </div>
            )}
            {text.trim() && <p className="hint" data-audio-state={draftRecorded ? 'recorded' : 'text-only'}>{draftRecorded ? 'This cheer plays as recorded audio.' : 'Text-only cheer. The runner will see your words.'}</p>}
            <p className="privacy">
              <Lock /> Your cheer is private to you and {runner}. Other supporters see that you cheered.
            </p>
            {pinError && <p className="error small">{pinError}</p>}
            {mode === 'now' ? (
              <>
                {/* Rounded down, so the cheer is never ahead of her: she's there, and it plays on arrival. */}
                <button className="btn primary" data-action="send" disabled={pinning || !text.trim()} onClick={() => leave(Math.floor(atKm * 100) / 100)}>
                  {draftRecorded && <Headphones />} {pinning ? 'Sending…' : 'Send now'}
                </button>
                <p className="hint">
                  {runner} is at km {formatKm(atKm)}.{' '}
                  <button className="link" data-action="pin-mode" onClick={() => setMode('pin')}>
                    Or pin it further along the course
                  </button>
                </p>
              </>
            ) : (
              <>
            <div className="field">
              <span>Where should {runner} get it?</span>
              <div className="km-pick">
                <label className="km-input">
                  km
                  <input
                    data-field="km"
                    inputMode="decimal"
                    value={kmText}
                    placeholder="32"
                    onChange={(e) => {
                      setKmText(e.target.value)
                      const v = Number(e.target.value.replace(',', '.'))
                      if (Number.isFinite(v) && v >= 0 && v <= COURSE_KM && e.target.value.trim()) setDraftKm(Math.round(v * 10) / 10)
                    }}
                  />
                </label>
                {!notStarted && !finished && (
                  <button className="btn tiny" onClick={() => pickKm(atKm + 0.3)}>
                    Just ahead of {runner}
                  </button>
                )}
              </div>
              <p className="hint">Or tap the course on the map.</p>
            </div>
            <button className="btn primary" data-action="pin" disabled={pinning || draftKm == null || !text.trim()} onClick={() => leave(draftKm)}>
              {pinning ? 'Pinning…' : draftKm != null ? `Pin cheer at km ${draftKm.toFixed(1)}` : 'Pin cheer'}
            </button>
            {running && (
              <p className="hint">
                <button className="link" data-action="now-mode" onClick={() => setMode('now')}>
                  Or send it now
                </button>
              </p>
            )}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="runner-head">
              <span className="avatar">{initialsOf(p?.name) || '·'}</span>
              <div>
                <h2>
                  {p?.name ?? 'Runner'} {p?.bib && <span className="bib mono">{p.bib}</span>}
                </h2>
                <p className="muted mono">{run ? (notStarted ? 'not started yet' : `updated ${agoLabel(run.updatedAt, now)}`) : 'connecting…'}</p>
              </div>
              <span className="watchers">{supporters} following</span>
            </div>

            <div className="stats three">
              {/* Dashes until the run has loaded: 0.00 would read as the runner's distance. */}
              <Stat label="Distance" value={run ? formatKm(atKm) : '–'} unit="km" big />
              <Stat label={slowing ? <>Pace <b className="slow" data-slowing="1">· slowing</b></> : 'Pace'} value={formatPace(p?.paceSec)} unit="/km" />
              <Stat label="Time" value={run && !notStarted ? formatClock(elapsed) : '–'} />
            </div>

            {finished ? (
              <div className="eta done">
                <b>{runner} finished.</b> {formatKm(atKm)} km in {formatClock(elapsed)}.
              </div>
            ) : nextMine && minsTo(nextMine.atKm) ? (
              <div className="eta" data-eta="mine">
                <b>About {minsTo(nextMine.atKm)} min</b> to your cheer at km {nextMine.atKm.toFixed(1)}
              </div>
            ) : !notStarted && minsTo(COURSE_KM) ? (
              <div className="eta">
                <b>About {minsTo(COURSE_KM)} min</b> to the finish
              </div>
            ) : null}

            {!finished && (
              <button className="btn primary cheer-cta" data-action="compose" disabled={state !== 'live' || free.length === 0} onClick={() => openComposer()}>
                <Headphones /> {free.length === 0 ? 'You have left 3 cheers' : running ? `Send ${runner} a cheer` : `Leave a cheer for ${runner}`}
              </button>
            )}

            <div className="feed">
              <h3>Cheers</h3>
              {cheers.length === 0 ? (
                <p className="muted small">None yet. Send one when {runner} needs it, or pin one to a spot on the course.</p>
              ) : (
                <ul className="cheer-list">
                  {cheers.map((c) => (
                    <li key={c.id} className={`${c.status === 'heard' ? 'heard' : c.status === 'delivered' ? 'delivered' : ''} ${c.mine ? 'mine' : ''}`} data-cheer-km={c.atKm} data-cheer-from={c.from}>
                      <span className="cheer-km mono">km {c.atKm.toFixed(1)}</span>
                      <span className="cheer-who">
                        <b>{c.mine ? 'You' : c.from}</b>
                        {c.message != null ? (
                          <span className="cheer-words">“{c.message}”</span>
                        ) : (
                          <span className="cheer-words private">
                            <Lock /> only {runner} gets the words
                          </span>
                        )}
                      </span>
                      {c.status === 'heard' ? <span className="heard-tag">{runner} heard it</span> : c.status === 'delivered' ? <span className="delivered-tag">delivered as text</span> : <span className="sent-tag">waiting</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <DevPanel role="supporter" pubnub={pubnub} slug={slug} token={session?.token} subscribeKey={session?.subscribeKey} lastEvent={lastEvent} />
          </>
        )}
      </section>

      {askName && (
        <div className="modal">
          <form
            className="card modal-card"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              saveName(name)
              nameRef.current = name.trim()
              setAskName(false)
            }}
          >
            <h2>Who's cheering?</h2>
            <p className="muted">The runner sees your name with each cheer.</p>
            <input data-field="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Mum" maxLength={24} />
            <button className="btn primary" type="submit">
              Follow the race
            </button>
          </form>
        </div>
      )}
    </main>
  )
}
