'use client'
import { useEffect, useState } from 'react'

export type Flash = { id: string; from: string; text: string; km: number; n: number; audio: 'preparing' | 'playing' | 'unavailable' | 'heard' | 'text-only' }

// Keep text visible while audio is prepared or played. A failed clip says so.
export default function CheerFlash({ flash }: { flash: Flash | null }) {
  const [shown, setShown] = useState<Flash | null>(null)

  useEffect(() => {
    if (!flash) return
    setShown(flash)
    if (flash.audio === 'preparing' || flash.audio === 'playing') return
    const timer = setTimeout(() => setShown(null), flash.audio === 'heard' ? 1800 : 6000)
    return () => clearTimeout(timer)
  }, [flash])

  if (!shown) return null
  const long = shown.text.length > 40
  return (
    <div className="cheer-flash" key={shown.n} role="status" aria-live="assertive" data-cheer-from={shown.from} data-audio-state={shown.audio}>
      <div className="cheer-burst" />
      <p className="cheer-from">
        From {shown.from} · km {shown.km.toFixed(1)}
      </p>
      <p className={`cheer-text ${long ? 'long' : ''}`}>{shown.text}</p>
      <p className="cheer-audio-label">{shown.audio === 'preparing' ? 'Preparing audio' : shown.audio === 'playing' ? 'Playing in your headphones' : shown.audio === 'unavailable' ? 'Audio unavailable · your cheer is here as text' : shown.audio === 'text-only' ? 'Text-only cheer' : 'Heard'}</p>
      {shown.audio === 'playing' && <div className="cheer-wave" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${(i % 5) * 0.11}s` }} />
        ))}
      </div>}
    </div>
  )
}
