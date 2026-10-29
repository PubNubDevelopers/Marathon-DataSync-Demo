'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Brand, Chips, Headphones } from '@/components/ui'
import { browserUserId, requestSession, saveName, savedName } from '@/lib/client/session'
import { saveRunConfig, type RunConfig } from '@/lib/client/run-config'
import { RACE_NAME } from '@/lib/race'

export default function StartScreen() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [bib, setBib] = useState('')
  const [busy, setBusy] = useState<'gps' | 'sim' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => setName(savedName()), [])

  const start = async (mode: 'gps' | 'sim') => {
    if (!name.trim()) {
      setError('Type your name first, so supporters know who they cheer for.')
      return
    }
    setError('')
    setBusy(mode)
    try {
      saveName(name)
      const session = await requestSession({ role: 'runner', userId: browserUserId('runner') })
      const config: RunConfig = { name: name.trim(), bib: bib.trim(), mode, secret: session.secret! }
      saveRunConfig(session.slug, config)
      router.push(`/run/${session.slug}#k=${session.secret}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  return (
    <main className="start">
      <header>
        <Brand sub="official app" />
      </header>
      <section className="start-hero">
        <p className="eyebrow">{RACE_NAME} · Sunday · 42.195 km</p>
        <h1>
          Your crowd,
          <br />
          <span className="accent">in your headphones.</span>
        </h1>
        <p className="lede">
          Share your link. Supporters follow you live and leave cheers along the course. Hear recorded cheers in your headphones and see written cheers on screen.
        </p>
      </section>

      <form
        className="card start-form"
        onSubmit={(e) => {
          e.preventDefault()
          void start('gps')
        }}
      >
        <label className="field">
          <span>Your name</span>
          <input data-field="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maya" maxLength={24} autoComplete="given-name" />
        </label>
        <div className="field">
          <label className="field">
            <span>Race bib number (optional)</span>
            <input data-field="bib" value={bib} onChange={(e) => setBib(e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 6))} placeholder="4127" inputMode="numeric" aria-describedby="bib-help" />
          </label>
          <p className="hint" id="bib-help">
            The number printed on the card pinned to your race shirt. For this demo, use any number or leave it blank.
          </p>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn primary" type="submit" disabled={!!busy} data-action="gps">
            {busy === 'gps' ? 'Starting…' : 'Run with GPS'}
          </button>
          <button className="btn ghost" type="button" disabled={!!busy} onClick={() => start('sim')} data-action="sim">
            {busy === 'sim' ? 'Starting…' : 'Simulate race day'}
          </button>
        </div>
        <p className="hint">
          <Headphones /> Keep the page open with your headphones in. A simulated race runs the whole course at 30× speed from your desk.
        </p>
      </form>

      <section className="start-foot">
        <p className="hint">Supporting someone? Open the link they shared with you.</p>
        <Chips />
      </section>
    </main>
  )
}
