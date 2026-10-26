import { NextResponse } from 'next/server'
import { SLUG_PATTERN, type SessionRequest, type SessionResponse } from '@/lib/race'
import { TOKEN_TTL_MINUTES, grantRunner, grantSupporter, issueRunnerSecret, keys, newSlug, verifyRunnerSecret } from '@/lib/server/pubnub'
import { accessManagerUrl, sharedResponse } from '@/lib/server/access-manager'

const USER_ID = /^[A-Za-z0-9_.-]{1,64}$/

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}

// POST /api/session
//   { role: 'runner', userId }                  register a new runner
//   { role: 'runner', userId, slug, secret }    resume or refresh
//   { role: 'supporter', userId, slug }         follow a runner and leave cheers
export async function POST(req: Request) {
  let body: SessionRequest
  try {
    body = await req.json()
  } catch {
    return bad(400, 'Body must be JSON')
  }
  if (!body || !USER_ID.test(body.userId ?? '')) return bad(400, 'userId is missing or invalid')

  if (accessManagerUrl()) return sharedResponse('session', body)

  try {
    let slug: string
    let token: string
    let secret: string | undefined
    let cheerSlots: string[] | undefined

    if (body.role === 'runner') {
      if (body.slug === undefined) {
        slug = newSlug()
        secret = await issueRunnerSecret(slug)
      } else {
        slug = body.slug
        if (!SLUG_PATTERN.test(slug)) return bad(400, 'Invalid runner')
        if (!(await verifyRunnerSecret(slug, body.secret ?? ''))) return bad(403, 'This is not the runner link')
      }
      token = await grantRunner(body.userId, slug)
    } else if (body.role === 'supporter') {
      slug = body.slug
      if (!SLUG_PATTERN.test(slug ?? '')) return bad(400, 'Invalid runner')
      ;({ token, slots: cheerSlots } = await grantSupporter(body.userId, slug))
    } else {
      return bad(400, 'role must be runner or supporter')
    }

    const res: SessionResponse = {
      ...keys(),
      userId: body.userId,
      token,
      ttlMinutes: TOKEN_TTL_MINUTES,
      role: body.role,
      slug,
      ...(secret ? { secret } : {}),
      ...(cheerSlots ? { cheerSlots } : {}),
    }
    return NextResponse.json(res, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('session failed', err)
    return bad(500, 'Could not issue a token. Check the server keys.')
  }
}
