import 'server-only'

export function accessManagerUrl() {
  return process.env.ACCESS_MANAGER_URL?.trim().replace(/\/+$/, '')
}

export async function sharedRequest(path: 'session' | 'verify' | 'timing', body: unknown) {
  const base = accessManagerUrl()
  if (!base) throw new Error('Set ACCESS_MANAGER_URL for the shared token service')
  return fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
}

export async function sharedResponse(path: 'session' | 'timing', body: unknown) {
  try {
    const upstream = await sharedRequest(path, body)
    const data = await upstream.json().catch(() => null)
    if (!data || upstream.status >= 500 || upstream.status === 404) {
      return Response.json({ error: 'The shared Marathon Access Manager is not ready. Check its deployment.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
    return Response.json(data, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Could not reach the shared Marathon Access Manager.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
