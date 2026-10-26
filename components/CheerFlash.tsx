'use client'
import { useEffect, useState } from 'react'

export type Flash = { from: string; text: string; km: number; n: number }

// Full-screen flash while a cheer plays, so a glance at the phone confirms it.
// It stays about as long as the voice takes to read the words.
export default function CheerFlash({ flash }: { flash: Flash | null }) {
  const [shown, setShown] = useState<Flash | null>(null)

  useEffect(() => {
    if (!flash) return
    setShown(flash)
    const timer = setTimeout(() => setShown(null), Math.min(10_000, 3500 + flash.text.length * 55))
    return () => clearTimeout(timer)
  }, [flash])

  if (!shown) return null
  const long = shown.text.length > 40
  return (
    <div className="cheer-flash" key={shown.n} role="status" aria-live="assertive" data-cheer-from={shown.from} style={{ animationDuration: `${Math.min(10_000, 3500 + shown.text.length * 55)}ms` }}>
      <div className="cheer-burst" />
      <p className="cheer-from">
        From {shown.from} · km {shown.km.toFixed(1)}
      </p>
      <p className={`cheer-text ${long ? 'long' : ''}`}>{shown.text}</p>
      <div className="cheer-wave" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${(i % 5) * 0.11}s` }} />
        ))}
      </div>
    </div>
  )
}
