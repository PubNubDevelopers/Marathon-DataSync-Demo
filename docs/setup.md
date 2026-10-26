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

## Deploy on Netlify

Import this GitHub repository into Netlify. The included `netlify.toml` selects Node.js 24, `npm run build`, and the `.next` publish directory. Netlify's Next.js adapter runs the API routes as serverless functions.

For the hosted team demo, set `ACCESS_MANAGER_URL` in the Netlify UI with Functions scope:

```text
https://devrel-demos-access-manager.netlify.app/.netlify/functions/api/marathon
```

The shared Access Manager must have its Marathon endpoints deployed first. It holds the PubNub keys, grants the same runner/supporter permissions described above, verifies runner links, and writes official timing results. The demo's `/api/session` and `/api/timing` routes forward requests to it. `/api/voice` also asks it to verify the runner link. Only public keys and scoped tokens reach the browser; the hosted demo needs no PubNub Secret Key.

Set `ELEVENLABS_API_KEY` as a secret with Functions scope if you want the ElevenLabs voice. Without it, browser speech still reads the cheers. After changing environment variables, deploy again.

For your own independent deployment, leave `ACCESS_MANAGER_URL` unset and configure your own keyset's publish, subscribe, and Secret Key as Netlify environment variables with Functions scope. The local setup steps above remain the same.

## Credentials

| Variable | Used by | Where it lives |
|---|---|---|
| `ACCESS_MANAGER_URL` | The hosted session, timing, and voice routes | Netlify environment variables; a URL, not a secret |
| `PUBNUB_PUBLISH_KEY`, `PUBNUB_SUBSCRIBE_KEY` | Local `/api/session`, which returns them to the browser at runtime | `.env.local`; held by the shared service for the team demo |
| `PUBNUB_SECRET_KEY` | Local token grants and timing | `.env.local`; held only by the shared service for the team demo |
| `PUBNUB_ADMIN_API_KEY` | `npm run setup:class` | `.env.local` on your machine. Don't deploy it. |
| `ELEVENLABS_API_KEY` | `/api/voice` | `.env.local`, or a secret Netlify environment variable |

None of these are `NEXT_PUBLIC_` variables, so none are compiled into the browser bundle.
