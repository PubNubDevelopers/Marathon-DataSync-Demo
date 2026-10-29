# Marathon DataSync reference

[Back to the visual walkthrough](../README.md) · [Setup and deployment](setup.md).

## The data

[`scripts/runner-class.json`](../scripts/runner-class.json) and [`scripts/cheer-class.json`](../scripts/cheer-class.json) define two entity classes, both with a TTL of two days.

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

## GPX and Strava

The runner's phone records `[longitude, latitude, timestamp]` points separately from the simplified DataSync trail. After the finish, `lib/gpx.ts` turns that local track into GPX 1.1 with a time on each point. `race.track.<slug>` in `localStorage` keeps it through reloads when browser storage is available. Simulated exports include "simulated" in the filename and activity title.

The optional Strava upload uses the runner-link check through the same local or shared Access Manager as the rest of the app:

| Route | Purpose |
|---|---|
| `GET /api/strava` | Reports whether credentials are configured and this browser has a valid token; never returns the token |
| `GET /api/strava/connect` | Starts OAuth with `activity:write` and a random state cookie; `back` accepts only a local runner page |
| `GET /api/strava/callback` | Verifies state and granted scope, exchanges the code, and keeps the access token in an httpOnly cookie |
| `POST /api/strava/upload` | Verifies the runner link, accepts `{ gpx, name, description }`, uploads using the token cookie, and checks processing status |

Upload requires the runner's slug and secret in the `x-race-run` and `x-race-key` headers. The server uses the runner slug as Strava's `external_id` to identify repeat uploads. Without Strava credentials, connect and upload return `503` and GPX download remains available. See [Strava setup](setup.md#strava-export).

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

## Project layout

```
app/api/session/route.ts   issues tokens
app/api/voice/route.ts     the headphones voice, from ElevenLabs
app/api/timing/route.ts    official times at the timing mats, written by the server
app/api/strava/            optional OAuth, status and GPX upload routes
app/page.tsx               the race's home
app/run/[id]/page.tsx      the runner's page
app/c/[id]/page.tsx        a supporter's page
components/                the screens, the course map, and "Under the hood"
lib/race.ts                entity ids, channel names, types
lib/course.ts              the course, kilometre by kilometre
lib/sim.ts                 the simulated race
lib/gpx.ts                 GPX 1.1 export from timestamped track points
lib/client/track.ts        per-run full track kept on the runner's phone
lib/server/strava.ts       Strava OAuth exchange and upload client
lib/server/pubnub.ts       Secret Key, grants, the runner secret, the timing mats
scripts/                   the class definitions, setup:class, check, e2e, the course builder
data/course.json           the course
```
