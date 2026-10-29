'use client'
import { useEffect, useState } from 'react'
import { toGpx, type TrackPoint } from '@/lib/gpx'

// After the finish: the run as a GPX file, and straight to Strava when the server has a
// Strava API app (STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET). The file comes from the
// track this phone recorded, with a time on every point, which Strava needs.
// A simulated run gets the file, labelled simulated, but never goes to Strava: it would
// put a marathon nobody ran on a real profile.

type Runner = { slug: string; secret: string }
type Status = { enabled: boolean; connected: boolean; athlete: string | null }
type Upload = { state: 'idle' | 'sending' | 'done' | 'failed'; activityId?: number; text?: string }

const RETURNED: Record<string, string> = {
  denied: "Strava wasn't connected.",
  'no-upload': "Strava was connected without upload access. Connect again and allow 'Upload your activities'.",
  expired: 'That Strava sign-in took too long. Try again.',
  failed: "Strava didn't confirm the sign-in. Try again.",
}

export default function StravaExport({ runner, simulated, track, cheeredBy }: { runner: Runner; simulated: boolean; track: () => TrackPoint[]; cheeredBy: string[] }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [upload, setUpload] = useState<Upload>({ state: 'idle' })
  const [returned, setReturned] = useState('')
  const points = track()
  const hasTrack = points.length >= 2

  useEffect(() => {
    fetch('/api/strava')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, connected: false, athlete: null }))
    // Back from Strava's sign-in: say how it went once, and tidy the address bar.
    const url = new URL(location.href)
    const result = url.searchParams.get('strava')
    if (result) {
      setReturned(RETURNED[result] ?? '')
      url.searchParams.delete('strava')
      history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
  }, [])

  const title = simulated ? 'Riverside Marathon, simulated run' : 'Riverside Marathon'
  const who = cheeredBy.length > 1 ? `${cheeredBy.slice(0, -1).join(', ')} and ${cheeredBy[cheeredBy.length - 1]}` : cheeredBy[0]
  const description = `${who ? `Cheered on by ${who}` : 'Followed live'} on the Riverside Marathon app, built with PubNub DataSync. ${typeof location === 'undefined' ? '' : location.origin}`.trim()
  const gpx = () => toGpx({ name: title, description, points: track() })

  const save = () => {
    const url = URL.createObjectURL(new Blob([gpx()], { type: 'application/gpx+xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `riverside-marathon-${runner.slug}${simulated ? '-simulated' : ''}.gpx`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const send = async () => {
    setUpload({ state: 'sending' })
    const res = await fetch('/api/strava/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-race-run': runner.slug, 'x-race-key': runner.secret },
      body: JSON.stringify({ gpx: gpx(), name: title, description }),
    }).catch(() => null)
    const body = (await res?.json().catch(() => null)) as { activityId?: number; error?: string; message?: string } | null
    if (res?.status === 401) {
      setStatus((s) => (s ? { ...s, connected: false } : s))
      setUpload({ state: 'failed', text: 'Strava needs you to connect again.' })
    } else if (res?.ok) setUpload({ state: 'done', activityId: body?.activityId, text: body?.message })
    else setUpload({ state: 'failed', text: body?.error ?? 'Could not reach Strava.' })
  }

  const connect = () => {
    location.href = `/api/strava/connect?back=${encodeURIComponent(`/run/${runner.slug}`)}`
  }

  return (
    <div className="export" data-track-points={points.length}>
      <div className="export-row">
        <button className="btn ghost small" onClick={save} disabled={!hasTrack} data-action="gpx">
          Save GPX
        </button>
        {status?.enabled && !simulated && hasTrack && upload.state !== 'done' && (
          <button className="btn strava small" onClick={status.connected ? send : connect} disabled={upload.state === 'sending'} data-action="strava">
            {upload.state === 'sending' ? 'Uploading…' : status.connected ? 'Upload to Strava' : 'Connect with Strava'}
          </button>
        )}
      </div>
      {!hasTrack && <p className="muted small">This phone has no recorded track for this run, so there's nothing to export.</p>}
      {hasTrack && simulated && <p className="muted small">A simulated run. The file says so, and it stays off Strava.</p>}
      {hasTrack && !simulated && !status?.enabled && <p className="muted small">Upload the file on strava.com, under Upload activity.</p>}
      {returned && upload.state === 'idle' && <p className="small export-note">{returned}</p>}
      {upload.state === 'done' &&
        (upload.activityId ? (
          <a className="strava-link" href={`https://www.strava.com/activities/${upload.activityId}`} target="_blank" rel="noreferrer">
            View on Strava
          </a>
        ) : (
          <p className="small export-note">{upload.text}</p>
        ))}
      {upload.state === 'failed' && <p className="small error">{upload.text}</p>}
    </div>
  )
}
