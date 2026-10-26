'use client'
import { useCallback, useEffect, useState } from 'react'
import type PubNub from 'pubnub'
import { apiError } from '@/lib/client/session'
import { CHEER_CLASS, runnerId, type CheerEntity } from '@/lib/race'

export type ActionResult = { title: string; status: number; code?: string; message?: string; json: unknown; n: number }

type Props = {
  role: 'runner' | 'supporter'
  pubnub: PubNub | null
  slug: string
  token?: string
  subscribeKey?: string
  position?: { lat: number; lng: number } | null
  lastEvent?: unknown
  onEmptyFix?: () => Promise<ActionResult | null>
  onFakeFinish?: () => Promise<ActionResult | null>
  sim?: { skip: (km: number) => void }
}

// Minimal JSON highlighting, so keys, strings, and numbers read apart.
function Json({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2) ?? 'undefined'
  const html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b|\b(true|false|null)\b/gi, (m, str, colon, num, lit) => {
      if (str) return colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`
      if (num) return `<span class="j-num">${num}</span>`
      return `<span class="j-lit">${lit}</span>`
    })
  return <pre className="json" dangerouslySetInnerHTML={{ __html: html }} />
}

// The trail is long. Show its start, so the rest of the record stays readable.
const short = (e: unknown) => {
  const p = (e as { payload?: Record<string, unknown> })?.payload
  if (!p || typeof p.trail !== 'string' || p.trail.length < 40) return e
  return { ...(e as object), payload: { ...p, trail: `${p.trail.slice(0, 24)}… (${p.trail.length} chars)` } }
}

export default function DevPanel({ role, pubnub, slug, token, subscribeKey, position, lastEvent, onEmptyFix, onFakeFinish, sim }: Props) {
  const id = runnerId(slug)
  const [open, setOpen] = useState(false)
  const [runner, setRunner] = useState<ActionResult | null>(null)
  const [cheers, setCheers] = useState<ActionResult | null>(null)
  const [action, setAction] = useState<ActionResult | null>(null)
  const [copied, setCopied] = useState(false)

  const read = useCallback(async () => {
    if (!pubnub) return
    try {
      const res = await pubnub.dataSync.getEntity({ id })
      setRunner({ title: `getEntity("${id}")`, status: res.status, json: short(res.data), n: Date.now() })
    } catch (e) {
      const err = apiError(e)
      setRunner({ title: `getEntity("${id}")`, status: err.status, code: err.code, json: err.body ?? err.message, n: Date.now() })
    }
    const title = `getEntities({ class: "${CHEER_CLASS}", filterFast: 'runner == "${slug}"' })`
    try {
      const res = await pubnub.dataSync.getEntities({ class: CHEER_CLASS, filterFast: `runner == "${slug}"`, limit: 100 })
      setCheers({ title, status: res.status, json: (res.data as CheerEntity[]).map((c) => ({ id: c.id, status: c.status, payload: c.payload })), n: Date.now() })
    } catch (e) {
      const err = apiError(e)
      setCheers({ title, status: err.status, code: err.code, json: err.body ?? err.message, n: Date.now() })
    }
  }, [pubnub, id, slug])

  useEffect(() => {
    if (open) void read()
  }, [open, read])

  const emptyFix = async () => {
    const r = await onEmptyFix?.()
    if (r) setAction(r)
  }

  const fakeFinish = async () => {
    const r = await onFakeFinish?.()
    if (r) setAction(r)
  }

  const supporterWrite = async () => {
    if (!pubnub) return
    const title = 'updateEntity on the run, with a supporter token'
    try {
      const res = await pubnub.dataSync.updateEntity({ id, replace: { '/payload/km': 42.195 } })
      setAction({ title, status: res.status, json: res.data, n: Date.now() })
    } catch (e) {
      const err = apiError(e)
      setAction({ title, status: err.status, code: err.code, json: err.body ?? err.message, n: Date.now() })
    }
  }

  // The same REST call the runner's phone makes, as a curl.
  const curl = () => {
    if (!token || !subscribeKey || !pubnub) return ''
    const lat = (position?.lat ?? 52.24) + 0.0021
    const lng = (position?.lng ?? 21.04) + 0.0018
    const body = JSON.stringify([
      { op: 'replace', path: '/payload/lat', value: +lat.toFixed(6) },
      { op: 'replace', path: '/payload/lng', value: +lng.toFixed(6) },
    ])
    return [
      `curl -X PATCH 'https://ps.pndsn.com/v1/datasync/subkeys/${subscribeKey}/entities/${id}?auth=${encodeURIComponent(token)}&uuid=${encodeURIComponent(pubnub.getUserId())}' \\`,
      `  -H 'Content-Type: application/json-patch+json' \\`,
      `  -d '${body}'`,
    ].join('\n')
  }

  const copyCurl = async () => {
    await navigator.clipboard.writeText(curl())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const parsed = (() => {
    try {
      return token && pubnub ? pubnub.parseToken(token) : undefined
    } catch {
      return undefined
    }
  })()

  return (
    <section className={`dev ${open ? 'open' : ''}`}>
      <button className="dev-toggle" onClick={() => setOpen(!open)}>
        <span className="mono">{'{ }'}</span> Under the hood
        <span className="dev-caret">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <div className="dev-body">
          <div className="dev-block">
            <div className="dev-head">
              <h3>What your token returns</h3>
              <button className="btn tiny" onClick={read}>
                Refresh
              </button>
            </div>
            <p className="dev-note">
              {role === 'runner'
                ? "Your token reads your run through the phone projection, without the official distance and time, and every cheer through the private projection, so each one includes its message."
                : "Your token reads other people's cheers through the default projection. DataSync leaves the message out before it reaches you. Your own cheers come through the private projection."}
            </p>
            {runner && (
              <>
                <p className="dev-status mono">
                  {runner.status} · {runner.title}
                </p>
                <Json value={runner.json} />
              </>
            )}
            {cheers && (
              <>
                <p className="dev-status mono">
                  {cheers.status} · {cheers.title}
                </p>
                <Json value={cheers.json} />
              </>
            )}
          </div>

          {role === 'runner' ? (
            <div className="dev-block">
              <h3>Schema check</h3>
              <p className="dev-note">
                The Runner class declares <code>lat</code> as a number that can't be null. A phone that has lost its GPS fix can send <code>null</code>, and DataSync rejects the write. On a laptop, press G to send one.
              </p>
              <button className="btn tiny danger" onClick={emptyFix}>
                Send an empty GPS fix
              </button>
              <h3 className="dev-sub">Official times</h3>
              <p className="dev-note">
                <code>officialKm</code> and <code>officialSec</code> come from the organiser's timing mats. Your token writes the run through the phone projection, which leaves them out, so a phone that records its own finish gets a <code>403</code>.
              </p>
              <button className="btn tiny danger" onClick={fakeFinish}>
                Try to record a finish
              </button>
              <h3 className="dev-sub">One REST write</h3>
              <p className="dev-note">
                Copy a curl <code>PATCH</code> with your token. Run it in a terminal and the dot moves on every supporter's map.
              </p>
              <button className="btn tiny" onClick={copyCurl}>
                {copied ? 'Copied' : 'Copy REST PATCH as curl'}
              </button>
              {sim && (
                <>
                  <h3 className="dev-sub">Simulated race</h3>
                  <button className="btn tiny" onClick={() => sim.skip(5)}>
                    Skip ahead 5 km
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="dev-block">
              <h3>Supporters can't write the run</h3>
              <p className="dev-note">Your token grants get on the run, not update.</p>
              <button className="btn tiny danger" onClick={supporterWrite}>
                Try to change the runner's km
              </button>
            </div>
          )}

          {action && (
            <div className="dev-block">
              <p className={`dev-status mono ${action.status >= 400 ? 'err' : 'ok'}`}>
                {action.status} {action.code ?? ''} · {action.title}
              </p>
              <Json value={action.json} />
            </div>
          )}

          {lastEvent !== undefined && (
            <div className="dev-block">
              <h3>Last DataSync event</h3>
              <Json value={short(lastEvent)} />
            </div>
          )}

          {parsed && (
            <div className="dev-block">
              <h3>Your token grants</h3>
              <Json value={{ resources: parsed.resources, patterns: parsed.patterns, meta: parsed.meta, ttl: parsed.ttl }} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
