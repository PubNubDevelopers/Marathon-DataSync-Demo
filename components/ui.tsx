import type { ReactNode } from 'react'
import Link from 'next/link'
import { RACE_NAME } from '@/lib/race'

export function Brand({ sub }: { sub?: string }) {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark" aria-hidden>
        <svg viewBox="0 0 24 24" width="19" height="19">
          <path d="M3 17c3.2-1.2 5.4-1.2 8.4 0s5.4 1.2 9.6-.6M3 12.5c3.2-1.2 5.4-1.2 8.4 0s5.4 1.2 9.6-.6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <circle cx="16.5" cy="5.5" r="2.2" fill="currentColor" />
        </svg>
      </span>
      <span className="brand-name">{RACE_NAME}</span>
      {sub && <span className="brand-sub">{sub}</span>}
    </Link>
  )
}

export function Chips() {
  return (
    <div className="chips">
      <span className="chips-label">PubNub is the backend</span>
      <span className="chip ds">DataSync</span>
      <span className="chip ps">Pub/Sub</span>
      <span className="chip am">Access Manager</span>
      <span className="chip pr">Presence</span>
    </div>
  )
}

// Marks what DataSync keeps out of someone's view.
export function Lock() {
  return (
    <svg className="lock" viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

export function Headphones() {
  return (
    <svg className="headphones" viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="3" y="14" width="5" height="7" rx="2" fill="currentColor" />
      <rect x="16" y="14" width="5" height="7" rx="2" fill="currentColor" />
    </svg>
  )
}

export function Live({ on = true, label = 'live' }: { on?: boolean; label?: string }) {
  return <span className={`live ${on ? 'on' : 'off'}`}>{label}</span>
}

export function Stat({ label, value, unit, big }: { label: ReactNode; value: string; unit?: string; big?: boolean }) {
  return (
    <div className={`stat ${big ? 'big' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
    </div>
  )
}

export const initialsOf = (name?: string) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
