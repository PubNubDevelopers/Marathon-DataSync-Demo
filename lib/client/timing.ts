// The runner's page tells the organiser's timing (/api/timing) each mat it has passed.
// The server writes the official distance and time; this phone's token can't.
type Runner = { slug: string; secret: string }

export async function reportMat(km: number, runner: Runner): Promise<boolean> {
  const res = await fetch('/api/timing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-race-run': runner.slug, 'x-race-key': runner.secret },
    body: JSON.stringify({ km }),
  }).catch(() => null)
  // Read the body, so the request completes and its connection is free again.
  await res?.json().catch(() => null)
  return !!res?.ok
}
