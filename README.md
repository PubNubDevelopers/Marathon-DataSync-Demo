# Riverside Marathon: cheers in your headphones

[Try the demo](https://marathon-datasync-demo.netlify.app/) · [Local setup](docs/setup.md) · [API reference](docs/reference.md)

Supporters follow a runner on a live map and leave cheers along the course. Her phone reads each cheer when she reaches it. The race is fictional; the PubNub calls are real.

![Two phone screens show Mum following Maya remotely and Maya hearing her cheer at kilometre 32.05. Mum's map shows Maya's position; Maya's red playback overlay displays Mum's encouragement, with a headphones icon and sound-wave bars beside it.](docs/images/cover-kilometre-32.png)

[Image description](docs/image-descriptions.md#cover-kilometre-32)

## Try it in two windows

1. Open the demo, enter a name and choose **Simulate race day**.
2. Open its supporter link in another window, then press **Start** on the runner's page.
3. Send a cheer now or pin one ahead. Under **Under the hood**, skip ahead 5 km, send an empty GPS fix, or try to record a finish.

## What runs where

The browser uses the PubNub JavaScript SDK. DataSync holds the live records; Pub/Sub carries cheer notices; Access Manager checks tokens. No application database is needed.

![Architecture diagram: Next.js browser pages and the PubNub JavaScript SDK exchange cheer notices with Pub/Sub and Runner/Cheer records with DataSync. Access Manager checks tokens. A separate server has session, timing and voice routes and no database. The drawing shows local key storage in .env.local.](docs/images/fig-architecture.png)

[Image description](docs/image-descriptions.md#fig-architecture)

The diagram shows local mode. The hosted Netlify demo uses our shared Access Manager for sessions, runner-link verification and timing. See [deployment and credentials](docs/setup.md#deploy-on-netlify).

## One write updates the following phones

![Left-to-right flow: Maya PATCHes runner.maya with km 31.621, lat 52.1923 and lng 21.0444. DataSync checks schema and token, stores the record and emits an event. Mum, Sam and Theo all display 31.62 km. Failed schema or projection checks store nothing and return 400 DS-0650 or 403 DS-0202.](docs/images/fig-one-write.png)

[Image description](docs/image-descriptions.md#fig-one-write)

[Subscription and reconnect code](docs/reference.md#events)

## Two classes describe the state

![Two schema tables compare Runner's default and phone projections with Cheer's default and private projections. Orange dots include a field; hollow circles omit it. Official timing fields are excluded from phone, and cheer message is excluded from default. Both classes expire after 172800 seconds from creation.](docs/images/fig-classes.png)

[Image description](docs/image-descriptions.md#fig-classes)

[Runner and Cheer fields](docs/reference.md#the-data) · [Class definitions](scripts/)

## Each person gets a scoped token

![A permission matrix compares Maya's runner token with each supporter's token. Maya can create, read and update her run through phone and read/update cheers through private. Supporters read the run and all cheers through default, but create/read/update only their own three cheer slots through private. Both receive run events and exchange cheer notices.](docs/images/fig-tokens.png)

[Image description](docs/image-descriptions.md#fig-tokens)

[Complete grants and token refresh](docs/reference.md#roles)

## Permissions apply to individual fields

![Two permission tables show different read and write projections. Sam's default cheer view contains from, atKm and status, but omits message; Maya's private view includes it. Leo's phone can write position and elapsed time but cannot write officialKm or officialSec. The organiser's server can write both timing fields.](docs/images/fig-field-permissions.png)

[Image description](docs/image-descriptions.md#fig-field-permissions)

[Official timing](docs/reference.md#official-times)

## A reconnect reads the current record

![A timeline shows Sam receiving writes at 39.97 and 39.99 km, missing nine events offline, then reading runner.maya once at 40.32 km before live events resume. Three phones show online, offline with the last position, and restored state. Missed events are not replayed.](docs/images/fig-reconnect.png)

[Image description](docs/image-descriptions.md#fig-reconnect)

## Bad writes leave the stored record unchanged

![Two examples show whole writes rejected. A GPS PATCH sets lat and lng to null and gets 400 DS-0650; a subsequent GET retains lat 52.1923 and km 31.621. Leo's phone tries officialKm 42.195 and officialSec 9146 outside its projection and gets 403 DS-0202. Neither write changes stored state.](docs/images/fig-refused.png)

[Image description](docs/image-descriptions.md#fig-refused)

[Try a REST PATCH](docs/reference.md#try-the-api-with-curl)

## A cheer combines stored state and a live notice

![A six-step sequence diagram follows Mum, DataSync, Pub/Sub, Maya and Sam. Mum creates a private Cheer record, publishes its id on cheers.<slug>, and both recipients read it with their own projections. Maya receives and plays the words; Sam receives author and kilometre only. Maya stores heard status and publishes a heard notice to Mum.](docs/images/fig-cheer-flow.png)

[Image description](docs/image-descriptions.md#fig-cheer-flow)

[Cheer events](docs/reference.md#events) · [Headphones voice and browser fallback](docs/reference.md#the-headphones-voice)

## Keep the finished run

![Three illustrated app screens show End run, Save GPX and optional Connect with Strava, then View on Strava. The finished example is 4.98 km in 31:41. The picture illustrates the optional configured export flow.](docs/images/fig-strava-export.png)

[Image description](docs/image-descriptions.md#fig-strava-export)

For a GPS run, press **End run**, then **Save GPX** to download the timestamped track recorded by this browser. The full track stays in local storage; DataSync holds the simplified trail used on supporters' maps. Export needs at least two recorded points. The app saves points periodically and when the page closes or the run finishes. Saved points survive a reload in the same browser when local storage is available; they do not transfer to another device.

Direct Strava upload is optional. With `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` configured on the server, a GPS runner can connect Strava, authorize uploads and send the GPX. Without those credentials, GPX download works on its own. Simulated exports are labeled simulated, and their finish screen offers GPX download without a Strava upload button. See [Strava setup](docs/setup.md#strava-export).

## Video review copy

[Watch the original 91-second film](https://youtu.be/NK_JBg687Go). This YouTube copy is private and requires access; it is not a public embed. The fictional race uses real PubNub calls. The film predates GPX and Strava export.

## Run locally or deploy

Use Node.js 22 or newer. Clone the repository, then follow [keyset setup](docs/setup.md#set-up-your-keyset) before running the app:

```sh
git clone https://github.com/PubNubDevelopers/Marathon-DataSync-Demo.git
cd Marathon-DataSync-Demo
npm ci
cp .env.example .env.local
```

The setup guide covers credentials, schema creation, class events, `npm run check`, `npm run dev`, and [Netlify deployment](docs/setup.md#deploy-on-netlify).

## Image descriptions for people and agents

Every image has alt text. The [description catalog](docs/image-descriptions.md) records layouts, labels, arrows, values and permission details for all 19 images. Agents can read the [JSON catalog](docs/images/descriptions.json) without interpreting pixels.

## Credits

Map tiles: [OpenFreeMap](https://openfreemap.org). Map data: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors; [course and ODbL details](data/COURSE.md). Fonts: [Nunito Sans](public/fonts/NunitoSans-OFL.txt) and [JetBrains Mono](public/fonts/JetBrainsMono-OFL.txt), SIL Open Font License.
