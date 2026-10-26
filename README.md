# Riverside Marathon: cheers in your headphones

The official app of a fictional city marathon, so everyone can be with their runner the whole way. A runner shares a link. Supporters see where she is, live on the course map, from anywhere, and send her a cheer the moment she needs one: her phone reads it into her headphones as soon as it arrives, "From Mum. Remember that hike in the rain? …" A cheer can also wait at a kilometre further along the course and play when she gets there.

PubNub is the whole backend. DataSync stores the runner and every cheer, validates each write against a schema, and decides which fields each person can read and write. Pub/Sub carries small notices ("a cheer was pinned", "she heard it"). Access Manager issues one token per person. The server code is three routes: one hands out those tokens, one makes the headphones voice with ElevenLabs, and one stands in for the organiser's timing mats.

## What the demo covers

| DataSync capability | Where you see it |
|---|---|
| One REST write updates every authorised subscriber | Each update from the runner's phone is one `PATCH` on `runner.<slug>`. Every supporter's page holds a token with `read` on that entity's channel and gets the event, so every map moves together. |
| Stored state, recovered after a refresh | A supporter who loses signal in the crowd reloads and gets the run and every cheer back from `getEntity` and `getEntities`, with "Restored from DataSync". |
| Field-level permissions | Reading: a cheer's `message` is in the `private` projection. The runner and the cheer's author read through it. Every other supporter reads `__default__`: who left a cheer and where, never the words. Writing: a runner's official distance and time (`officialKm`, `officialSec`) come only from the organiser's timing mats. The runner's phone reads and writes her run through the `phone` projection, which leaves them out, so a phone that records its own finish gets a `403` and nothing is saved. At km 24 the course passes 470 m from the finish: **Under the hood** has **Try to record a finish**. Grants limit writes too: a supporter can't change someone else's cheer or the run (`403`). |
| Schema validation | A phone that has lost its GPS fix can send `lat: null`. `lat` is a non-nullable number, so DataSync answers `400 DS-0650` and no map jumps. **Under the hood** has **Send an empty GPS fix**, and G sends one during a simulated run. |

## Set up your keyset

You need your own PubNub account. Nothing in this repo points at a shared keyset.

Use Node.js 22 or newer and npm. Clone the demo first:

```sh
git clone https://github.com/PubNubDevelopers/Marathon-DataSync-Demo.git
cd Marathon-DataSync-Demo
```

1. [Create a PubNub account](https://admin.pubnub.com/#/register) and a keyset. DataSync is available to new accounts and to accounts that aren't actively using App Context.
2. On the keyset, turn on **Access Manager**. DataSync rejects every request without it.
3. Open the keyset's **DataSync** tab, turn on **Enable DataSync**, and pick a region. You can't change the region later.
4. Create a **Service Integration** with **Read & write** on **DataSync** for this keyset. Copy the API key now; the Portal shows it once. Only `npm run setup:class` uses it.
5. Copy `.env.example` to `.env.local` and fill in the publish key, subscribe key, Secret Key, the API key, and optionally `ELEVENLABS_API_KEY`.
6. Install and create the classes:

   ```sh
   npm install
   npm run setup:class
   ```

7. In the **DataSync** tab, under **Select entities to sync**, turn on events for `Runner` version 1 and `Cheer` version 1, and save. A new rule can take up to five minutes to apply.
8. Check the whole setup against your keyset:

   ```sh
   npm run check
   ```

   It registers a runner, pins a cheer as Mum, reads it as Sam and as the runner, lists cheers through both tokens, tries two writes Sam isn't allowed to make, sends the empty GPS fix, tries a finish from the runner's phone (refused) and writes an official time as the organiser, and sends one REST `PATCH` while Sam's token listens. Every line should say `PASS`.
9. Start the app and open <http://localhost:3000>:

   ```sh
   npm run dev
   ```

   Type a name and press **Simulate race day**. Open the supporters' link from the runner's page in another window, then press **Start** on the runner's page. On the supporters' page, **Send Maya a cheer**, type it and press **Send now**: the runner's page plays it as soon as it arrives. **Or pin it further along the course** leaves one that waits at a kilometre. The simulator runs the 42.195 km course at 30× speed; **Under the hood** can skip ahead 5 km at a time.

## The data

[`scripts/runner-class.json`](scripts/runner-class.json) and [`scripts/cheer-class.json`](scripts/cheer-class.json) define two entity classes, both with a TTL of two days.

`Runner`, one per runner, id `runner.<slug>`:

| Property | Path | Type | Required | Projections |
|---|---|---|---|---|
| `name` | `/payload/name` | string | yes | `__default__`, `phone` |
| `bib` | `/payload/bib` | string | no | `__default__`, `phone` |
| `lat`, `lng` | `/payload/lat`, `/payload/lng` | number | yes | `__default__`, `phone` |
| `km` | `/payload/km` | number | yes | `__default__`, `phone` |
| `paceSec`, `elapsedSec` | `/payload/…` | number | no | `__default__`, `phone` |
| `fixAt` | `/payload/fixAt` | datetime | no | `__default__`, `phone` |
| `trail` | `/payload/trail` | string, an [encoded polyline](https://developers.google.com/maps/documentation/utilities/polylinealgorithm) | no | `__default__`, `phone` |
| `status` | `/status` | `ready`, `running`, `finished` | | `__default__`, `phone` |
| `officialKm`, `officialSec` | `/payload/…` | number: the last timing mat crossed and the race time there | no | `__default__` |

`Cheer`, one per pinned cheer, id `cheer.<runner slug>.<supporter key>-<n>`:

| Property | Path | Type | Required | Projections |
|---|---|---|---|---|
| `runner` | `/payload/runner` | string, filtering `simple` | yes | `__default__`, `private` |
| `from` | `/payload/from` | string | yes | `__default__`, `private` |
| `atKm` | `/payload/atKm` | number | yes | `__default__`, `private` |
| `heardAt` | `/payload/heardAt` | datetime | no | `__default__`, `private` |
| `message` | `/payload/message` | string | yes | `private` |
| `status` | `/status` | `pinned`, `heard` | | `__default__`, `private` |

Every page lists the cheers for a runner with `getEntities({ class: 'Cheer', filterFast: 'runner == "<slug>"' })`. DataSync applies the caller's projection to each item.

## Roles

`POST /api/session` issues one of two tokens. Both last 60 minutes, and the pages ask for a new one five minutes before expiry.

| | Runner | Supporter |
|---|---|---|
| `runner.<slug>` | `create`, `get`, `update`, projection `phone` | `get` |
| Every cheer for the runner (pattern `^cheer\.<slug>\..+$`) | `get`, `update`, projection `private` | `get`, projection `__default__` |
| Their own three cheer ids | | `create`, `get`, `update`, projection `private` |
| Channel `runner.<slug>` (DataSync events) | `read` | `read` |
| Channel `cheers.<slug>` (notices) and its presence channel | `read`, `write` | `read`, `write` |

A supporter's own cheer ids are exact resources in the token, and an exact match wins over the pattern, so they read and write their own cheers through `private`. The runner proves who she is with the secret in her link, `/run/<slug>#k=<secret>`, an HMAC of the slug made with the Secret Key, so the app keeps no database of its own.

Here's Mum's cheer, read with Sam's token and with the runner's:

```jsonc
// Sam                                   // the runner
"payload": {                             "payload": {
  "runner": "k7q2m9x4pd",                  "runner": "k7q2m9x4pd",
  "from": "Mum",                           "from": "Mum",
  "atKm": 32                               "atKm": 32,
}                                          "message": "Remember that hike in the rain? …"
                                         }
```

## Events

With the event rules on, DataSync publishes an event for each change to a `Runner` on its id channel, `runner.<slug>`, with the default view. Every page subscribes there:

```ts
const sub = pubnub.dataSyncEntity(`runner.${slug}`).subscription()
sub.onDataSync = (event) => apply(event.message.data)
sub.subscribe()
```

The runner's page draws the run from these events too, not from the phone's own numbers, so every phone shows the same run at the same moment. Events missed while a page is offline aren't sent again, so the supporters' page reads the run again after a reconnect or a reload.

A cheer is a `Cheer` record. Sent now, its `atKm` is the runner's distance as the supporter's page has it, so she's already there and her phone plays it as soon as it reads it; pinned, it waits for her. Cheers have no channel to subscribe to before they exist, so the author publishes `{ "type": "pinned", "id": "<cheer id>" }` on `cheers.<slug>` after creating one, and every page reads it through its own token. That notice is what makes a cheer live. When the runner hears it, her page first stores her position and waits for DataSync's event for it, so every map has her at the cheer, then sets `status` to `heard`, adds `heardAt`, and publishes `{ "type": "heard", "id": … }`.

## The headphones voice

The runner's page reads each cheer with an [ElevenLabs](https://elevenlabs.io) voice (Sarah, `eleven_v4_turbo`): "From Mum. …". The page sends the words it read through its own token to `POST /api/voice`, with the runner's slug and link secret in the `x-race-run` and `x-race-key` headers, so the route never needs the private projection itself. One runner can make 40 new lines an hour. If the route fails, the browser's own speech says the line.

## Official times

Timing mats lie every 5 km and at the finish. When the runner's record passes one, the official distance and race time go into `officialKm` and `officialSec`, and every supporter's map shows them ("Timing mat 30 km · 3:09:59", then "Official finish"). Only the server writes those fields, with its own client. The runner's token can't: its `phone` projection leaves them out, and DataSync refuses a write that names a field outside the token's projection, whole, with a `403`.

In the demo, `POST /api/timing` stands in for the mats. The runner's page calls it with `{ "km": 25 }` and the runner's slug and secret in headers, like `/api/voice`, after DataSync has stored a distance past that mat. The route reads the run with the server's client, and records the mat only if the stored distance has reached it. A real race would call it from the chip-timing system.

## Try the API with curl

The runner's page has **Copy REST PATCH as curl** under **Under the hood**:

```sh
curl -X PATCH "https://ps.pndsn.com/v1/datasync/subkeys/$SUB_KEY/entities/runner.$SLUG?auth=$RUNNER_TOKEN&uuid=$RUNNER_USER_ID" \
  -H 'Content-Type: application/json-patch+json' \
  -d '[{"op":"replace","path":"/payload/lat","value":52.2412},{"op":"replace","path":"/payload/lng","value":21.0461}]'
```

Every open supporters' page moves the dot. Send a `null` instead and DataSync rejects the write:

```json
{ "errors": [{ "errorCode": "DS-0650", "message": "Non-nullable field at '/payload/lat' is null or missing", "path": "/payload/lat" }] }
```

## Credentials

| Variable | Used by | Where it lives |
|---|---|---|
| `PUBNUB_PUBLISH_KEY`, `PUBNUB_SUBSCRIBE_KEY` | `/api/session`, which returns them to the browser at runtime | `.env.local`, or Vercel environment variables |
| `PUBNUB_SECRET_KEY` | `/api/session`, to grant tokens | `.env.local` for local dev only |
| `PUBNUB_CONNECTOR` | `/api/session` reads the Secret Key from Vercel Connect when this is set | Vercel environment variables |
| `PUBNUB_ADMIN_API_KEY` | `npm run setup:class` | `.env.local` on your machine. Don't deploy it. |
| `ELEVENLABS_API_KEY` | `/api/voice` | `.env.local`, or a sensitive Vercel environment variable |

None of these are `NEXT_PUBLIC_` variables, so none are compiled into the browser bundle.

## Project layout

```
app/api/session/route.ts   issues tokens
app/api/voice/route.ts     the headphones voice, from ElevenLabs
app/api/timing/route.ts    official times at the timing mats, written by the server
app/page.tsx               the race's home
app/run/[id]/page.tsx      the runner's page
app/c/[id]/page.tsx        a supporter's page
components/                the screens, the course map, and "Under the hood"
lib/race.ts                entity ids, channel names, types
lib/course.ts              the course, kilometre by kilometre
lib/sim.ts                 the simulated race
lib/server/pubnub.ts       Secret Key, grants, the runner secret, the timing mats
scripts/                   the class definitions, setup:class, check, e2e, the course builder
data/course.json           the course
```

## Credits

Map tiles come from [OpenFreeMap](https://openfreemap.org), with map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. The course was routed on OpenStreetMap data and is under the ODbL; see `data/COURSE.md`. Fonts are [Nunito Sans](public/fonts/NunitoSans-OFL.txt) and [JetBrains Mono](public/fonts/JetBrainsMono-OFL.txt), both under the SIL Open Font License.
