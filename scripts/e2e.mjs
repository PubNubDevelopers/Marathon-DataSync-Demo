// End-to-end test in three real browser pages against a running app and real DataSync:
//
//   npm run e2e                    against http://localhost:3000
//   npm run e2e -- <url>           against a deployment
//
// A runner starts a simulated race. Two supporters open her link. One pins a cheer
// 0.6 km ahead; the other sees the pin without its words, and later sends one live. The race starts, both
// supporters' maps follow the same DataSync events, the cheer plays on the runner's
// page and turns "heard" for its author, and a supporter who reloads gets the run back.
// The runner's phone tries to record its own finish and gets a 403; at the finish the
// organiser's timing writes the official time, and the supporters see it. The finished
// run downloads as valid GPX, survives a reload, and a simulated run stays off Strava.
// A separate browser with mocked GPS checks the real-run export without uploading
// anything to a real Strava account.
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '')
const PHONE = { width: 390, height: 844 }
const results = []
const step = (ok, name, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ok = (p) => p.then(() => true, () => false)
const eventually = async (check, timeout = 15000) => {
  const end = Date.now() + timeout
  do {
    if (await check()) return true
    await sleep(200)
  } while (Date.now() < end)
  return false
}

const downloadGpx = async (page) => {
  const waiting = page.waitForEvent('download', { timeout: 10000 })
  await page.locator('[data-action=gpx]').click()
  const download = await waiting
  const xml = readFileSync(await download.path(), 'utf8')
  const info = await page.evaluate((source) => {
    const document = new DOMParser().parseFromString(source, 'application/xml')
    const nodes = [...document.querySelectorAll('trkpt')]
    const times = nodes.map((point) => Date.parse(point.querySelector('time')?.textContent ?? ''))
    return {
      valid: !document.querySelector('parsererror') && document.documentElement.localName === 'gpx' && document.documentElement.getAttribute('version') === '1.1',
      name: document.querySelector('trk > name')?.textContent,
      points: nodes.length,
      firstLatitude: Number(nodes[0]?.getAttribute('lat')),
      firstLongitude: Number(nodes[0]?.getAttribute('lon')),
      coordinates: nodes.every((point) => {
        const lat = Number(point.getAttribute('lat'))
        const lng = Number(point.getAttribute('lon'))
        return point.hasAttribute('lat') && point.hasAttribute('lon') && Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180
      }),
      timed: times.every((time, index) => Number.isFinite(time) && (!index || time >= times[index - 1])),
    }
  }, xml)
  return { ...info, filename: download.suggestedFilename() }
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = async () => browser.newContext({ viewport: PHONE, deviceScaleFactor: 1, colorScheme: 'dark' })
const runner = await (await ctx()).newPage()
const mumCtx = await ctx()
const mum = await mumCtx.newPage()
const sam = await (await ctx()).newPage()

try {
  const stravaResponse = await runner.request.get(`${BASE}/api/strava`)
  const strava = await stravaResponse.json()
  step(stravaResponse.ok() && typeof strava.enabled === 'boolean' && strava.connected === false && strava.athlete === null && !('token' in strava), 'Strava status reports configuration without exposing a token', strava.enabled ? 'configured; no account connected' : 'not configured')
  if (!strava.enabled) {
    const connect = await runner.request.get(`${BASE}/api/strava/connect`, { maxRedirects: 0 })
    const upload = await runner.request.post(`${BASE}/api/strava/upload`, { data: {} })
    step(connect.status() === 503 && upload.status() === 503, 'Unconfigured Strava connect and upload fail clearly', `${connect.status()} / ${upload.status()}`)
  } else {
    const upload = await runner.request.post(`${BASE}/api/strava/upload`, { data: {} })
    step(upload.status() === 403, 'Strava upload rejects a request without a runner link', `${upload.status()}`)
  }

  await runner.goto(BASE)
  await runner.getByPlaceholder('Maya').fill('Maya')
  await runner.getByPlaceholder('4127').fill('4127')
  await runner.locator('[data-action=sim]').click()
  await runner.waitForURL(/\/run\/[a-z0-9]{10}/, { timeout: 20000 })
  const slug = runner.url().match(/\/run\/([a-z0-9]{10})/)[1]
  step(await ok(runner.locator('[data-action=start]:not([disabled])').waitFor({ timeout: 20000 })), 'Runner registers and gets a page', slug)

  for (const [p, name] of [[mum, 'Mum'], [sam, 'Sam']]) {
    await p.goto(`${BASE}/c/${slug}`)
    await p.locator('[data-field=name]').fill(name)
    await p.getByRole('button', { name: 'Follow the race' }).click()
  }
  step(await ok(mum.locator('.supporter[data-state=live]').waitFor({ timeout: 20000 })), 'Supporters load the runner from DataSync')

  await mum.locator('[data-action=compose]').click()
  await mum.locator('[data-field=km]').fill('0.6')
  await mum.locator('[data-field=message]').fill('Go Maya, go!')
  await mum.locator('[data-action=pin]').click()
  step(await ok(mum.locator('.cheer-list li.mine').waitFor({ timeout: 10000 })), 'Mum pins a cheer at km 0.6')

  await sam.locator('.cheer-list li[data-cheer-from=Mum]').waitFor({ timeout: 15000 }).catch(() => {})
  const samRow = (await sam.locator('.cheer-list li[data-cheer-from=Mum]').textContent().catch(() => '')) ?? ''
  step(samRow.includes('only') && !samRow.includes('Go Maya'), "Sam sees Mum's pin without the words", samRow.replace(/\s+/g, ' ').trim())

  await runner.locator('.cheer-list li[data-cheer-km="0.6"]').waitFor({ timeout: 15000 }).catch(() => {})
  await runner.locator('[data-action=start]').click()
  await runner.evaluate(() => window.__race?.setSpeed(20))
  let kms = []
  const synced = await eventually(async () => {
    kms = await Promise.all([mum, sam].map((p) => p.locator('.supporter').getAttribute('data-km')))
    return kms.every((k) => +k > 0.05) && kms[0] === kms[1]
  })
  step(synced, 'Both supporters follow the same DataSync events', kms.join(' / '))

  const cheat = await runner.evaluate(() => window.__race?.cheat().then((r) => r?.status))
  step(cheat === 403 && (await ok(runner.locator('[data-refused="403"]').waitFor({ timeout: 5000 }))), "The runner's phone can't record its own finish", `${cheat}`)

  step(await ok(runner.locator('.cheer-flash[data-cheer-from=Mum]').waitFor({ timeout: 60000 })), 'The cheer plays on the runner page at km 0.6')
  step(await ok(mum.locator('.cheer-list li.mine.heard').waitFor({ timeout: 15000 })), "Mum's cheer turns heard")

  // A cheer sent now, mid-race: it's at her current kilometre, so it plays as soon as it arrives.
  await sam.locator('[data-action=compose]').click()
  await sam.locator('[data-field=message]').fill('Go go go!')
  const sent = Date.now()
  await sam.locator('[data-action=send]').click()
  step(await ok(runner.locator('.cheer-flash[data-cheer-from=Sam]').waitFor({ timeout: 15000 })), "Sam's cheer, sent now, plays on the runner page", `${((Date.now() - sent) / 1000).toFixed(1)} s after the tap`)

  await mumCtx.setOffline(true)
  step(await ok(mum.locator('[data-banner=offline]').waitFor({ timeout: 10000 })), 'Offline banner')
  await sleep(4000)
  await mumCtx.setOffline(false)
  await mum.reload()
  step(await ok(mum.locator('[data-banner=restored]').waitFor({ timeout: 15000 })), 'Reload restores the run from DataSync', (await mum.locator('[data-banner=restored]').textContent().catch(() => ''))?.trim())
  step(await ok(mum.locator('.cheer-list li.mine.heard').waitFor({ timeout: 10000 })), 'and the heard cheer with it')

  await runner.evaluate(() => window.__race?.skipTo(42.1))
  step(await ok(runner.locator('.card.finished').waitFor({ timeout: 60000 })), 'The runner finishes')
  step(await ok(sam.locator('.finish-banner').waitFor({ timeout: 20000 })), 'Supporters see the finish')
  step(await ok(sam.locator('[data-official="42.195"]').waitFor({ timeout: 20000 })), "and the official time from the organiser's timing", (await sam.locator('.official-chip').textContent().catch(() => ''))?.trim())

  const exported = await downloadGpx(runner)
  step(exported.valid && exported.coordinates && exported.timed && exported.points > 1000 && exported.name?.includes('simulated') && exported.filename.endsWith('-simulated.gpx'), 'The simulated run downloads as valid GPX with ordered times and a simulation label', `${exported.points} points`)
  step((await runner.locator('[data-action=strava]').count()) === 0, 'A simulated run stays off Strava')

  await runner.reload()
  await runner.locator('.card.finished').waitFor({ timeout: 20000 })
  const restoredExport = await downloadGpx(runner)
  step(restoredExport.valid && restoredExport.timed && restoredExport.points === exported.points, 'The finished track survives a reload and exports again', `${restoredExport.points} points`)

  const gpsContext = await browser.newContext({ viewport: PHONE, permissions: ['geolocation'], geolocation: { latitude: 52.2395, longitude: 21.0455, accuracy: 5 } })
  const gps = await gpsContext.newPage()
  await gps.goto(BASE)
  await gps.getByPlaceholder('Maya').fill('GPS export check')
  await gps.locator('[data-action=gps]').click()
  await gps.waitForURL(/\/run\/[a-z0-9]{10}/, { timeout: 20000 })
  await gps.locator('[data-action=start]:not([disabled])').waitFor({ timeout: 20000 })
  await gps.locator('[data-action=start]').click()
  await gps.locator('.runner[data-phase=running]').waitFor({ timeout: 10000 })
  await sleep(1200)
  await gpsContext.setGeolocation({ latitude: 52.2397, longitude: 21.0455, accuracy: 5 })
  await sleep(1200)
  await gpsContext.setGeolocation({ latitude: 52.2399, longitude: 21.0455, accuracy: 5 })
  step(await eventually(async () => Number(await gps.locator('.runner').getAttribute('data-km')) > 0.02), 'A GPS run records location changes', 'mocked browser GPS')
  await gps.reload()
  await gps.locator('[data-action=start]:not([disabled])').waitFor({ timeout: 20000 })
  await gps.locator('[data-action=start]').click()
  await gps.locator('.runner[data-phase=running]').waitFor({ timeout: 10000 })
  await sleep(1200)
  await gpsContext.setGeolocation({ latitude: 52.2401, longitude: 21.0455, accuracy: 5 })
  await sleep(1200)
  await gps.locator('[data-action=end]').click()
  step(await gps.locator('[data-action=end]').textContent() === 'Tap again to end your run', 'Ending a GPS run requires a second tap')
  await gps.locator('[data-action=end]').click()
  await gps.locator('.card.finished').waitFor({ timeout: 20000 })
  const gpsExport = await downloadGpx(gps)
  step(gpsExport.valid && gpsExport.coordinates && gpsExport.timed && gpsExport.points >= 2 && !gpsExport.name?.includes('simulated') && !gpsExport.filename.includes('-simulated'), 'A GPS run exports a timed track without a simulation label', `${gpsExport.points} points; mocked GPS`)
  step(gpsExport.points >= 4 && gpsExport.firstLatitude === 52.2395 && gpsExport.firstLongitude === 21.0455, 'A mid-run reload keeps the earlier GPS track in the final export', `${gpsExport.points} points, including the first fix`)
  step(strava.enabled ? await ok(gps.locator('[data-action=strava]').waitFor({ timeout: 10000 })) : (await gps.locator('[data-action=strava]').count()) === 0, 'The GPS Strava button matches server configuration', strava.enabled ? 'connect offered; no upload attempted' : 'GPX only')
  await gpsContext.close()
} catch (e) {
  step(false, 'unexpected error', e.message)
}

await browser.close()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
