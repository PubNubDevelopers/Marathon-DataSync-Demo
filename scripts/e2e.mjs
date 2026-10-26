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
// organiser's timing writes the official time, and the supporters see it.
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

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = async () => browser.newContext({ viewport: PHONE, deviceScaleFactor: 1, colorScheme: 'dark' })
const runner = await (await ctx()).newPage()
const mumCtx = await ctx()
const mum = await mumCtx.newPage()
const sam = await (await ctx()).newPage()

try {
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
  await sleep(6000)
  const kms = await Promise.all([mum, sam].map((p) => p.locator('.supporter').getAttribute('data-km')))
  step(kms.every((k) => +k > 0.05) && kms[0] === kms[1], 'Both supporters follow the same DataSync events', kms.join(' / '))

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
} catch (e) {
  step(false, 'unexpected error', e.message)
}

await browser.close()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
