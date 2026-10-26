// Creates the Runner and Cheer entity classes, version 1, on your keyset with the Admin API.
//
//   npm run setup:class                     create them
//   npm run setup:class -- --replace        overwrite existing versions with the JSON files
//   npm run setup:class -- --replace Runner only the classes named
//
// Needs PUBNUB_SUBSCRIBE_KEY and PUBNUB_ADMIN_API_KEY in .env.local.
import { readFileSync } from 'node:fs'

const subKey = process.env.PUBNUB_SUBSCRIBE_KEY
const apiKey = process.env.PUBNUB_ADMIN_API_KEY
if (!subKey || !apiKey) {
  console.error('Set PUBNUB_SUBSCRIBE_KEY and PUBNUB_ADMIN_API_KEY in .env.local first.')
  process.exit(1)
}

const VERSION = 1
const headers = {
  Authorization: apiKey,
  'PubNub-Version': '2026-09-17',
  'Content-Type': 'application/vnd.pubnub.objects.entity-class+json;version=1',
  Accept: 'application/json',
}

async function call(url, method, body) {
  const res = await fetch(url, { method, headers, ...(body ? { body } : {}) })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = text
  }
  return { status: res.status, json }
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
for (const [name, file] of [
  ['Runner', 'runner-class.json'],
  ['Cheer', 'cheer-class.json'],
].filter(([name]) => !only.length || only.includes(name))) {
  const url = `https://admin-api.pubnub.com/v2/datasync/subkeys/${subKey}/entity-classes/${name}/versions/${VERSION}`
  const body = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
  let res = await call(url, 'POST', body)
  if (res.status === 409) {
    if (process.argv.includes('--replace')) {
      console.log(`${name} v${VERSION} exists. Replacing it with scripts/${file}.`)
      res = await call(url, 'PUT', body)
    } else {
      console.log(`${name} v${VERSION} already exists on this keyset. Use --replace to overwrite it.`)
      res = await call(url, 'GET')
    }
  }
  if (res.status >= 300) {
    console.error(`Admin API returned ${res.status} for ${name}`)
    console.error(JSON.stringify(res.json, null, 2))
    if (res.status === 403) console.error('Check that the API key has Read & write on DataSync for this keyset.')
    process.exit(1)
  }
  const cls = res.json.data
  console.log(`\n${name} v${cls.version} on ${subKey} (TTL ${cls.config?.ttlSec} s)\n`)
  for (const p of cls.properties ?? []) {
    const views = (p.projections ?? [{ name: '__default__' }]).map((v) => v.name).join(', ')
    console.log(`  ${p.name.padEnd(11)} ${p.path.padEnd(18)} ${(p.valueKind ?? '').padEnd(9)} ${p.isNullable === false ? 'required ' : '         '} ${views}`)
  }
}
console.log(`
Next: in the Admin Portal, open the keyset's DataSync tab and, under
"Select entities to sync", turn on events for Runner version ${VERSION} and Cheer
version ${VERSION}. A new rule can take up to five minutes to apply.`)
