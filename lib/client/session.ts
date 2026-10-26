'use client'
import PubNub from 'pubnub'
import type { SessionRequest, SessionResponse } from '@/lib/race'

// A stable id per browser. Tokens are granted to this id.
export function browserUserId(prefix: 'runner' | 'supporter') {
  const key = `race.userId.${prefix}`
  let id = localStorage.getItem(key)
  if (!id) {
    id = `${prefix}-${crypto.randomUUID().slice(0, 12)}`
    localStorage.setItem(key, id)
  }
  return id
}

export const savedName = () => localStorage.getItem('race.name') ?? ''
export const saveName = (name: string) => localStorage.setItem('race.name', name.trim())

export async function requestSession(req: SessionRequest): Promise<SessionResponse> {
  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `Session failed (${res.status})`)
  return json as SessionResponse
}

// The keys arrive at runtime from /api/session, so the bundle has none.
export function createClient(session: SessionResponse) {
  const pubnub = new PubNub({
    publishKey: session.publishKey,
    subscribeKey: session.subscribeKey,
    userId: session.userId,
    restore: true,
  })
  pubnub.setToken(session.token)
  return pubnub
}

// Asks for a new token five minutes before the old one expires. Call the
// returned `refresh` after a 403 as well.
export function keepTokenFresh(pubnub: PubNub, req: SessionRequest, onToken?: (s: SessionResponse) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | undefined

  const schedule = (ttlMinutes: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => void refresh(), Math.max(1, ttlMinutes - 5) * 60_000)
  }

  const refresh = () => {
    inFlight ??= requestSession(req)
      .then((s) => {
        pubnub.setToken(s.token)
        schedule(s.ttlMinutes)
        onToken?.(s)
      })
      .finally(() => {
        inFlight = undefined
      })
    return inFlight
  }

  return { schedule, refresh, stop: () => clearTimeout(timer) }
}

// DataSync errors come back as PubNubError with the HTTP status and the
// service's error body.
export function apiError(e: unknown) {
  const status = (e as { status?: { statusCode?: number; errorData?: unknown } })?.status
  const body = status?.errorData as { errors?: { errorCode?: string; message?: string; path?: string }[] } | undefined
  return {
    status: status?.statusCode ?? 0,
    code: body?.errors?.[0]?.errorCode,
    message: body?.errors?.[0]?.message ?? (e as Error)?.message,
    body,
  }
}
