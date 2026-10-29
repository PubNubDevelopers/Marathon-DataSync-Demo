// Real browser/native Web Audio checks for the shipped ElevenLabs recordings. Audio is
// recordings only: custom written cheers stay text and never reach a TTS provider.
// Playback failures are simulated by intercepting one shipped MP3. voice-api-test.mjs
// separately checks the route's authorization and text-only answers.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { installVoiceProbe } from './voice-probe.mjs'

const BASE = (process.argv[2] ?? 'http://127.0.0.1:3100').replace(/\/$/, '')
const EVIDENCE = process.env.VOICE_EVIDENCE_DIR
if (EVIDENCE) mkdirSync(EVIDENCE, { recursive: true })
const PHONE = { width: 390, height: 844 }
const CLIPS = ['start', 'resume', 'finish', 'cheer-go', 'cheer-hike', 'cheer-finish']
const results = []
const evidence = { deployment: BASE, scope: 'Real bundled MP3 decode and native Web Audio playback. Custom text is text-only. Failures are an intercepted shipped MP3. No provider generation.' }
const step = (success, name, detail = '') => {
  results.push(success)
  console.log(`${success ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const eventually = async (check, timeout = 25000) => {
  const until = Date.now() + timeout
  do {
    if (await check()) return true
    await sleep(150)
  } while (Date.now() < until)
  return false
}
const probe = (page) => page.evaluate(() => window.__voiceProbe)
const validAudio = (entry) => entry.duration > 0.2 && entry.channels > 0 && entry.sampleRate >= 16000 && entry.rms > 0.001 && entry.peak > 0.01
const realEnds = (entry) => entry.duration > 0.2 && entry.contextState === 'running'
const noSpeech = (held) => held.speechCalls === 0 && held.utterances === 0
const noApi = (held) => !held.requests.some((request) => request.path === '/api/voice')

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: PHONE })
await context.addInitScript(installVoiceProbe)
const runner = await context.newPage()
const supporterContext = await browser.newContext({ viewport: PHONE })
const alex = await supporterContext.newPage()

// A supporter with any name: recorded cheers no longer belong to Mum or Sam.
const follow = async (page, slug, name) => {
  await page.goto(`${BASE}/c/${slug}`)
  await page.locator('[data-field=name]').fill(name)
  await page.getByRole('button', { name: 'Follow the race' }).click()
  await page.locator('.supporter[data-state=live]').waitFor({ timeout: 20000 })
}
const rows = (state) => alex.locator(`.cheer-list li.mine.${state}`).count()

try {
  // Decode every shipped recording using native Web Audio in a separate page,
  // so asset integrity checks cannot inflate application playback measurements.
  const assetPage = await browser.newPage()
  await assetPage.goto(BASE)
  const paths = CLIPS.map((name) => `/audio/voice/v1/${name}.mp3`)
  const assets = await assetPage.evaluate(async (paths) => {
    const audio = new OfflineAudioContext(1, 44100, 44100)
    const results = []
    for (const path of paths) {
      const response = await fetch(path)
      const bytes = await response.arrayBuffer()
      const size = bytes.byteLength
      try {
        const buffer = await audio.decodeAudioData(bytes)
        const values = buffer.getChannelData(0)
        let energy = 0
        let peak = 0
        for (const value of values) { energy += value * value; peak = Math.max(peak, Math.abs(value)) }
        results.push({ path, status: response.status, type: response.headers.get('content-type'), bytes: size, duration: buffer.duration, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate, rms: Math.sqrt(energy / values.length), peak })
      } catch (error) {
        results.push({ path, status: response.status, bytes: size, error: error.name })
      }
    }
    return results
  }, paths)
  evidence.assets = assets
  step(assets.length === CLIPS.length && assets.every((asset) => asset.status === 200 && /^audio\/mpeg/.test(asset.type ?? '') && validAudio(asset)), 'All six shipped MP3 recordings decode to a non-silent audio signal', assets.map((asset) => `${asset.path.split('/').at(-1)} ${asset.duration?.toFixed(2) ?? '?'}s`).join('; '))
  await assetPage.close()

  const otherRunnerContext = await browser.newContext({ viewport: PHONE })
  const otherRunner = await otherRunnerContext.newPage()
  await otherRunner.goto(BASE)
  await otherRunner.getByPlaceholder('Maya').fill('Noah')
  await otherRunner.locator('[data-action=sim]').click()
  await otherRunner.waitForURL(/\/run\/[a-z0-9]{10}/, { timeout: 20000 })
  const otherSlug = new URL(otherRunner.url()).pathname.split('/').at(-1)
  await otherRunner.locator('[data-action=start]:not([disabled])').waitFor({ timeout: 20000 })
  const otherSupporterContext = await browser.newContext({ viewport: PHONE })
  const otherSupporter = await otherSupporterContext.newPage()
  await follow(otherSupporter, otherSlug, 'Alex')
  await otherSupporter.locator('[data-action=compose]').click()
  step(await otherSupporter.locator('[data-action=recorded-cheer][data-clip-id=cheer-go]').count() === 0 && await otherSupporter.locator('[data-action=recorded-cheer][data-clip-id=cheer-hike]').count() === 1, 'A runner-specific recorded cheer is hidden for another runner while a general cheer remains available')
  await otherSupporterContext.close()
  await otherRunnerContext.close()

  await runner.goto(BASE)
  await runner.getByPlaceholder('Maya').fill('Maya')
  await runner.locator('[data-action=sim]').click()
  await runner.waitForURL(/\/run\/[a-z0-9]{10}/, { timeout: 20000 })
  const slug = new URL(runner.url()).pathname.split('/').at(-1)
  const runnerKey = new URLSearchParams(new URL(runner.url()).hash.slice(1)).get('k')
  const headers = { 'x-race-run': slug, 'x-race-key': runnerKey }
  const deniedPrompt = await context.request.get(`${BASE}/api/voice?say=start`, { maxRedirects: 0 })
  const allowedPrompt = await context.request.get(`${BASE}/api/voice?say=start`, { headers, maxRedirects: 0 })
  const allowedPreset = await context.request.post(`${BASE}/api/voice`, { headers, data: { from: 'Alex', message: 'Go Maya, go!' }, maxRedirects: 0 })
  const customText = await context.request.post(`${BASE}/api/voice`, { headers, data: { from: 'Alex', message: 'Words nobody recorded.' }, maxRedirects: 0 })
  step(deniedPrompt.status() === 403 && allowedPrompt.status() === 303 && allowedPrompt.headers().location === '/audio/voice/v1/start.mp3' && allowedPreset.status() === 303 && allowedPreset.headers().location === '/audio/voice/v1/cheer-go.mp3', 'The real voice endpoint verifies runner authorization and redirects known lines to their recordings')
  step(customText.status() === 200 && (await customText.json()).mode === 'text-only', 'The real voice endpoint answers text-only for words without a recording')
  await runner.locator('[data-action=start]:not([disabled])').waitFor({ timeout: 20000 })
  await runner.locator('[data-action=start]').click()
  await runner.evaluate(() => window.__race?.setSpeed(1))
  step(await eventually(async () => (await probe(runner)).ended.some(realEnds)), 'The bundled start prompt completes native Web Audio playback')
  let held = await probe(runner)
  step(held.requests.some((request) => request.path === '/audio/voice/v1/start.mp3' && request.status === 200) && noApi(held), 'The start prompt loads its static MP3 without a dynamic TTS request')
  step(held.decoded.some(validAudio) && held.started.some((entry) => entry.duration > 0.2 && entry.contextState === 'running' && entry.connected), 'Playback uses a decoded non-silent buffer connected to the real audio destination')

  await follow(alex, slug, 'Alex')
  const send = async ({ text, clipId }) => {
    await alex.locator('[data-action=compose]').click()
    if (clipId) await alex.locator(`[data-action=recorded-cheer][data-clip-id=${clipId}]`).click()
    else await alex.locator('[data-field=message]').fill(text)
    const hint = await alex.locator('.hint[data-audio-state]').getAttribute('data-audio-state')
    await alex.locator('[data-action=send]').click()
    return hint
  }

  const presetHint = await send({ clipId: 'cheer-go' })
  const playingPreset = await eventually(async () => {
    const current = await probe(runner)
    return current.started.filter((entry) => entry.duration > 0.2).length >= 2 && current.ended.filter(realEnds).length === 1
  })
  const unheardDuringPlayback = (await rows('heard')) === 0
  const heardAfterPlayback = await eventually(async () => (await rows('heard')) === 1)
  step(presetHint === 'recorded' && playingPreset && unheardDuringPlayback && heardAfterPlayback, 'A recorded cheer from a supporter named Alex is acknowledged only after its recording finishes')
  held = await probe(runner)
  step(held.requests.some((request) => request.path === '/audio/voice/v1/cheer-go.mp3' && request.status === 200) && noApi(held) && held.ended.filter(realEnds).length >= 2, 'The recorded cheer uses its bundled recording without dynamic TTS')

  const beforeCustom = await probe(runner)
  const customHint = await send({ text: 'A unique custom cheer that nobody recorded.' })
  const shownAsText = await eventually(async () => await runner.locator('.cheer-flash[data-cheer-from=Alex][data-audio-state=text-only]').count() > 0)
  const delivered = await eventually(async () => (await rows('delivered')) === 1)
  await sleep(1500)
  held = await probe(runner)
  step(customHint === 'text-only' && shownAsText && delivered && (await rows('heard')) === 1, 'A custom cheer shows as text on the runner page and turns "delivered as text", not heard')
  step(held.started.length === beforeCustom.started.length && held.requests.length === beforeCustom.requests.length && noApi(held) && noSpeech(held), 'A custom cheer plays no audio, makes no voice request and uses no browser speech')
  if (EVIDENCE) await runner.locator('.cheers-card').screenshot({ path: join(EVIDENCE, 'voice-text-only.png') })

  // The next recorded cheer fails twice (HTTP error, then undecodable bytes) before the real file.
  const clipRequests = []
  let nextResponse = 'http-error'
  await runner.route('**/audio/voice/v1/cheer-finish.mp3', async (route) => {
    const kind = nextResponse
    clipRequests.push(kind)
    if (kind === 'http-error') await route.fulfill({ status: 502, contentType: 'text/plain', body: 'Unavailable for this test' })
    else if (kind === 'corrupt') await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from('This is not an MP3 recording.') })
    else await route.continue()
  })
  const beforeFailure = await probe(runner)
  await send({ clipId: 'cheer-finish' })
  const failed = await eventually(async () => await runner.locator('[data-action=retry-cheer]').count() > 0 && await runner.getByText(/Audio unavailable/i).count() > 0)
  await sleep(1500)
  held = await probe(runner)
  step(failed && (await rows('heard')) === 1 && (await rows('delivered')) === 1, 'A recording that fails to load stays visible as text and is not marked heard')
  step(held.started.length === beforeFailure.started.length && clipRequests.length === 1 && noSpeech(held), 'Audio failure plays no substitute voice and does not retry on its own')
  if (EVIDENCE) await runner.locator('.cheers-card').screenshot({ path: join(EVIDENCE, 'voice-unavailable-text.png') })
  nextResponse = 'corrupt'
  await runner.locator('[data-action=retry-cheer]').click()
  const decodeFailed = await eventually(async () => (await probe(runner)).decodeFailures.length > 0 && await runner.locator('[data-action=retry-cheer]').count() > 0)
  held = await probe(runner)
  step(decodeFailed && (await rows('heard')) === 1 && noSpeech(held), 'An undecodable recording also stays as text without a substitute voice')
  nextResponse = 'success'
  await runner.locator('[data-action=retry-cheer]').click()
  step(await eventually(async () => (await rows('heard')) === 2), 'Explicit retry plays the recording once it loads and marks the cheer heard')
  step(clipRequests.join(',') === 'http-error,corrupt,success', 'Each explicit retry fetches the recording once', clipRequests.join(' → '))
  await runner.unroute('**/audio/voice/v1/cheer-finish.mp3')
  evidence.clipRequests = clipRequests
  evidence.beforeReload = await probe(runner)

  await runner.reload()
  await runner.locator('[data-action=start]:not([disabled])').waitFor({ timeout: 20000 })
  await runner.locator('[data-action=start]').click()
  step(await eventually(async () => (await probe(runner)).ended.some(realEnds)), 'The bundled resume prompt completes native playback after reload')
  held = await probe(runner)
  step(held.requests.some((request) => request.path === '/audio/voice/v1/resume.mp3' && request.status === 200) && noApi(held), 'Resuming uses its static recording without dynamic generation')
  await runner.evaluate(() => { window.__race?.setSpeed(600); window.__race?.skipTo(42.18) })
  step(await eventually(async () => (await probe(runner)).requests.some((request) => request.path === '/audio/voice/v1/finish.mp3' && request.status === 200)), 'The finish prompt loads its bundled recording')
  step(await eventually(async () => (await probe(runner)).ended.filter(realEnds).length >= 2), 'The bundled finish prompt completes native playback')
  held = await probe(runner)
  evidence.afterReload = held
  step(noSpeech(held) && noSpeech(evidence.beforeReload), 'No browser speech synthesis is called on success, text-only, failure, retry, resume or finish')
} catch (error) {
  const message = error.message.replace(/([#&]k=)[^&\s"'<>]+/g, '$1[redacted]')
  evidence.failure = { message }
  if (EVIDENCE) await runner.locator('main').screenshot({ path: join(EVIDENCE, 'failure-ui.png') }).catch(() => {})
  step(false, 'unexpected voice test error', message)
} finally {
  if (EVIDENCE) writeFileSync(join(EVIDENCE, 'voice-playback.json'), JSON.stringify(evidence, null, 2) + '\n')
  await browser.close()
}

console.log(`\n${results.filter(Boolean).length}/${results.length} voice browser checks passed (real bundled audio; custom cheers text-only)`)
process.exitCode = results.every(Boolean) ? 0 : 1
