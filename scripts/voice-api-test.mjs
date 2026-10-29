// Exercises the actual static-only voice route with authorization isolated.
// There are no real credentials or external calls. The fetch spy rejects any
// attempt to generate audio. Native decoding/playback is tested by voice-e2e.mjs.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const requireBundled = createRequire(import.meta.url)
const babel = requireBundled('next/dist/compiled/babel/core')
const typescriptPreset = requireBundled.resolve('next/dist/compiled/babel/preset-typescript')
const commonJsPlugin = requireBundled.resolve('next/dist/compiled/babel/plugin-transform-modules-commonjs')
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const test = async (name, run) => {
  try { await run(); results.push(true); console.log(`PASS  ${name}`) }
  catch (error) { results.push(false); console.log(`FAIL  ${name}: ${error.message}`) }
}

function harness() {
  const outbound = []
  const modules = new Map()
  const load = (path) => {
    if (modules.has(path)) return modules.get(path).exports
    const mod = { exports: {} }
    modules.set(path, mod)
    const code = babel.transformSync(readFileSync(path, 'utf8'), { filename: path, babelrc: false, configFile: false, presets: [typescriptPreset], plugins: [commonJsPlugin] }).code
    const require = (id) => {
      if (id === '@/lib/server/pubnub') return { verifyRunnerSecret: async (slug, secret) => /^[a-z0-9]{10}$/.test(slug) && secret === 'qa-valid-secret' }
      if (id === '@/lib/race' || id === '@/lib/voice-catalog') return load(join(ROOT, id.slice(2) + '.ts'))
      throw new Error(`Unexpected route dependency: ${id}`)
    }
    vm.runInNewContext(code, {
      exports: mod.exports, module: mod, require,
      process: { env: {} },
      fetch: async (...args) => { outbound.push(args); throw new Error('Static-only voice must not make an outbound audio request') },
      Request, Response, Headers, URL, AbortSignal, TextEncoder, TextDecoder, Buffer, setTimeout, clearTimeout,
      console: { error() {}, warn() {}, log() {} },
    }, { filename: path })
    return mod.exports
  }
  return { route: load(join(ROOT, 'app/api/voice/route.ts')), outbound }
}

const request = (method, body, { slug = 'qavoice001', secret = 'qa-valid-secret', say = 'start' } = {}) => new Request(`https://qa.invalid/api/voice?say=${encodeURIComponent(say)}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'x-race-run': slug, 'x-race-key': secret },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
})
const custom = (message) => ({ from: 'Taylor', message })
const privateNoStore = (response) => {
  assert.match(response.headers.get('Cache-Control') ?? '', /private/)
  assert.match(response.headers.get('Cache-Control') ?? '', /no-store/)
}

await test('Runner authorization rejects prompt and cheer requests before any audio access', async () => {
  const { route, outbound } = harness()
  for (const method of ['GET', 'POST']) {
    const response = await route[method](request(method, custom('A custom cheer'), { secret: 'invalid' }))
    assert.equal(response.status, 403)
    privateNoStore(response)
  }
  assert.equal(outbound.length, 0)
})

await test('Malformed runner identifiers cannot access the voice compatibility API', async () => {
  const { route, outbound } = harness()
  for (const slug of ['', '../another-run', 'short']) assert.equal((await route.POST(request('POST', custom('Go Maya, go!'), { slug }))).status, 403)
  assert.equal(outbound.length, 0)
})

await test('All three announcements redirect to their shipped MP3 without generation', async () => {
  const { route, outbound } = harness()
  for (const say of ['start', 'resume', 'finish']) {
    const response = await route.GET(request('GET', undefined, { say }))
    assert.equal(response.status, 303)
    assert.equal(new URL(response.headers.get('Location'), 'https://qa.invalid').pathname, `/audio/voice/v1/${say}.mp3`)
    privateNoStore(response)
  }
  assert.equal(outbound.length, 0)
})

await test('Unknown and inherited announcement names are rejected', async () => {
  const { route, outbound } = harness()
  for (const say of ['unknown', 'toString', 'constructor']) assert.equal((await route.GET(request('GET', undefined, { say }))).status, 400)
  assert.equal(outbound.length, 0)
})

await test('Recorded cheer matching uses normalized words for every sender', async () => {
  const { route, outbound } = harness()
  for (const [message, path] of [
    ['Go Maya, go!', '/audio/voice/v1/cheer-go.mp3'],
    ['Remember that hike in the rain? You wanted to turn back, and we made it to the top together. Keep going, love.', '/audio/voice/v1/cheer-hike.mp3'],
    ["You're nearly there. We're waiting at the finish!", '/audio/voice/v1/cheer-finish.mp3'],
    ['Go  Maya,\ngo!', '/audio/voice/v1/cheer-go.mp3'],
  ]) {
    for (const from of ['Mum', 'Sam', 'Taylor']) {
      const response = await route.POST(request('POST', { from, message }))
      assert.equal(response.status, 303)
      assert.equal(new URL(response.headers.get('Location'), 'https://qa.invalid').pathname, path)
      privateNoStore(response)
    }
  }
  assert.equal(outbound.length, 0)
})

await test('Invalid, normalized-empty and overlong messages are rejected', async () => {
  const { route, outbound } = harness()
  for (const body of [{}, { from: 3, message: 'hi' }, custom('   '), custom('<>{}'), custom('x'.repeat(121))]) {
    const response = await route.POST(request('POST', body))
    assert.equal(response.status, 400)
    privateNoStore(response)
  }
  assert.equal(outbound.length, 0)
})

await test('New custom text is explicitly text-only and never invokes a provider', async () => {
  const { route, outbound } = harness()
  const response = await route.POST(request('POST', custom('A unique cheer with no shipped recording.')))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Content-Type'), /^application\/json/)
  assert.equal((await response.json()).mode, 'text-only')
  privateNoStore(response)
  assert.equal(outbound.length, 0)
})

await test('Repeated custom text remains text-only across runners and does not generate audio', async () => {
  const { route, outbound } = harness()
  for (const slug of ['qavoice001', 'qavoice002']) {
    for (let i = 0; i < 3; i++) {
      const response = await route.POST(request('POST', custom('A private text-only cheer.'), { slug }))
      assert.equal(response.status, 200)
      assert.equal((await response.json()).mode, 'text-only')
      privateNoStore(response)
    }
  }
  assert.equal(outbound.length, 0)
})

console.log(`\n${results.filter(Boolean).length}/${results.length} static voice API checks passed (authorization isolated; no external calls)`)
process.exitCode = results.every(Boolean) ? 0 : 1
