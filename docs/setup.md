# Set up the Marathon demo

[Back to the visual walkthrough](../README.md).

## Set up your keyset

For local setup, use your own PubNub account and keyset. The hosted team demo gets scoped tokens from the shared Access Manager, as described in [Deploy on Netlify](#deploy-on-netlify).

Use Node.js 22 or newer and npm. Clone the demo first:

```sh
git clone https://github.com/PubNubDevelopers/Marathon-DataSync-Demo.git
cd Marathon-DataSync-Demo
```

1. [Create a PubNub account](https://admin.pubnub.com/#/register) and a keyset. DataSync is available to new accounts and to accounts that aren't actively using App Context.
2. On the keyset, turn on **Access Manager**. DataSync rejects every request without it.
3. Open the keyset's **DataSync** tab, turn on **Enable DataSync**, and pick a region. You can't change the region later.
4. Create a **Service Integration** with **Read & write** on **DataSync** for this keyset. Copy the API key now; the Portal shows it once. Only `npm run setup:class` uses it.
5. Copy `.env.example` to `.env.local` and fill in the publish key, subscribe key, Secret Key and provisioning API key.
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

## Deploy on Netlify

Import this GitHub repository into Netlify. The included `netlify.toml` selects Node.js 24, `npm run build`, and the `.next` publish directory. Netlify's Next.js adapter runs the API routes as serverless functions.

For the hosted team demo, set `ACCESS_MANAGER_URL` in the Netlify UI with Functions scope:

```text
https://devrel-demos-access-manager.netlify.app/.netlify/functions/api/marathon
```

The shared Access Manager must have its Marathon endpoints deployed first. It holds the PubNub keys, grants the same runner/supporter permissions described above, verifies runner links, and writes official timing results. The demo's `/api/session` and `/api/timing` routes forward requests to it. `/api/voice` also asks it to verify the runner link. Only public keys and scoped tokens reach the browser; the hosted demo needs no PubNub Secret Key.

The start, resume and finish announcements and three demo cheers are shipped as ElevenLabs audio files. They need no API key. All supporters can choose a recorded cheer; custom written cheers remain text and are marked delivered as text. The app makes no voice-generation requests. If a recording cannot play, its words stay visible with **Audio unavailable** and **Retry audio**, and the cheer is not marked heard.

For your own independent deployment, leave `ACCESS_MANAGER_URL` unset and configure your own keyset's publish, subscribe, and Secret Key as Netlify environment variables with Functions scope. The local setup steps above remain the same.

## Strava export

After a run, **Save GPX** downloads a GPX 1.1 file with a timestamp on every recorded point. The full track stays in this browser's `localStorage`; DataSync keeps the simplified trail used by supporters' maps. The app saves the track during the run, when the page is hidden, and at the finish. If browser storage is blocked or full, keep the page open until you download the file. A runner link opened on another phone restores the shared race state but does not copy the original phone's full track.

For a GPS run, tap **End run**, then tap again to confirm. The simulator finishes itself. Simulated GPX files are labelled as simulated, and their finish screen has no Strava upload button.

To enable direct upload for GPS runs:

1. [Register a Strava API app](https://www.strava.com/settings/api) and set its Authorization Callback Domain to the deployed site's domain, without `https://` or a path. Use `localhost` for local development.
2. Add `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` to `.env.local`, or to Netlify environment variables with Functions scope, then redeploy. Keep the client secret on the server.
3. Finish a GPS run and choose **Connect with Strava**. Allow the requested `activity:write` scope, then choose **Upload to Strava**. The server uploads the GPX and checks Strava's processing result. **View on Strava** appears when Strava returns the activity ID; a pending result means processing is still in progress.

The short-lived access token is kept in an httpOnly cookie scoped to `/api/strava`; the browser's JavaScript never receives it. The app does not retain a refresh token, so it asks the runner to reconnect after expiry. Strava controls which athletes a registered API app may connect. Check its current capacity before inviting other runners.

Without these two variables, the finish screen still offers **Save GPX**. You can import the downloaded file into another running app yourself. See Strava's [authentication](https://developers.strava.com/docs/authentication/) and [upload](https://developers.strava.com/docs/uploads/) documentation for the API requirements.

## Credentials

| Variable | Used by | Where it lives |
|---|---|---|
| `ACCESS_MANAGER_URL` | The hosted session, timing, and voice routes | Netlify environment variables; a URL, not a secret |
| `PUBNUB_PUBLISH_KEY`, `PUBNUB_SUBSCRIBE_KEY` | Local `/api/session`, which returns them to the browser at runtime | `.env.local`; held by the shared service for the team demo |
| `PUBNUB_SECRET_KEY` | Local token grants and timing | `.env.local`; held only by the shared service for the team demo |
| `PUBNUB_ADMIN_API_KEY` | `npm run setup:class` | `.env.local` on your machine. Don't deploy it. |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | Optional `/api/strava` routes | `.env.local`, or Netlify environment variables with Functions scope; keep the client secret private |

None of these are `NEXT_PUBLIC_` variables, so none are compiled into the browser bundle.

## Check audio playback

With the app running, `npm run e2e:voice -- http://localhost:3000` checks the bundled MP3 files, actual Web Audio playback, text-only delivery and visible recording failure/retry behavior. `npm run test:voice-api` checks the actual route with mocked runner authorization, including redirects to known recordings and the text-only response for custom words. Neither suite needs an ElevenLabs account. There is no live generation path to configure.
