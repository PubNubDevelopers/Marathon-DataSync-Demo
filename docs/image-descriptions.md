# Marathon image descriptions

[Visual walkthrough](../README.md) · [Machine-readable JSON](images/descriptions.json)

This catalog describes every image used by the README and the two article drafts, plus the other images in their shared library. It includes layout, arrows, labels, example values and the meaning of each comparison. The images depict a fictional recorded race or an explanatory diagram; their numbers are illustrative, not current live results.

For text-only agents, read the description and visible-text list for the image id. The JSON also supplies public image URLs, dimensions and SHA-256 hashes. In the recording, ids such as `runner.maya` are illustrative; the app generates a random run slug. The architecture figure depicts local mode. The hosted Netlify demo uses the shared Access Manager described in [setup](setup.md#deploy-on-netlify).

## cover-kilometre-32

**A cheer from 300 km away**

Image: [cover-kilometre-32.png](images/cover-kilometre-32.png) · 1920 × 1080 pixels

**Alt text:** Two phone screens show Mum following Maya remotely and Maya hearing her cheer at kilometre 32.05. Mum's map shows Maya's position; Maya's red playback overlay displays Mum's encouragement, with a headphones icon and sound-wave bars beside it.

**Detailed description:** A landscape composition on a dark navy background, headed 'A cheer from 300 km away, sent live', with Pub/Sub and LIVE badges. The left phone is labelled Mum, at home, 300 km away. Its Riverside Marathon map shows Maya and a cheer pin at km 32.0; the dashboard reads 32.05 km, pace 7:03/km, elapsed time 3:24:02, and three following. The right phone is labelled Maya, km 32. A red playback overlay reads 'FROM MUM · KM 32.0' above the full encouragement: 'Remember that hike in the rain? You wanted to turn back, and we made it to the top together. Keep going, love.' A headphones icon, 'IN HER HEADPHONES' label and coral waveform represent the audio. The upper-right race progress indicator repeats Maya's distance and elapsed time. These are screens from the fictional recorded race, not a current live result.

**Visible labels and values:**

- `A cheer from 300 km away, sent live`
- `Pub/Sub`
- `LIVE`
- `Mum · at home · 300 km away`
- `Maya · km 32`
- `32.05 km`
- `7:03/km`
- `3:24:02`
- `FROM MUM · KM 32.0`
- `Remember that hike in the rain? You wanted to turn back, and we made it to the top together. Keep going, love.`
- `IN HER HEADPHONES`

## one-write-every-phone

**One write, every phone in sync**

Image: [one-write-every-phone.png](images/one-write-every-phone.png) · 1920 × 1080 pixels

**Alt text:** Four phones are arranged left to right: Maya writes, while Mum, Sam and Theo receive events. All four maps and dashboards show Maya at 1.39 km, pace 6:21/km and elapsed time 9:00. A footer explains that DataSync stores one REST write and sends it to the following phones.

**Detailed description:** Four recorded phone screens sit side by side beneath the title 'One write, every phone in sync' and DataSync/STORED badges. Maya's phone, first on the left, has a coral 'writes' badge; Mum's, Sam's and Theo's phones each have a green 'event' badge. Theo is identified as her colleague. All four show the same coral route and runner marker, distance 1.39 km, pace 6:21/km and race time 9:00. Maya's screen says 'Saved to DataSync 0 s ago'; the supporter screens show Maya, bib 4127, three following, an estimated 259 minutes to the finish and a 'Send Maya a cheer' button. The footer states that one REST write from Maya's phone is stored by DataSync and sent to every phone following her. The upper-right progress strip repeats 1.39 km and 0:09:00.

**Visible labels and values:**

- `One write, every phone in sync`
- `DataSync · STORED`
- `Maya · writes`
- `Mum · event`
- `Sam · event`
- `Theo · her colleague · event`
- `1.39 km`
- `6:21/km`
- `9:00`
- `One REST write from Maya's phone. DataSync stores it and sends it to every phone following her.`

## fig-architecture

**What runs where**

Image: [fig-architecture.png](images/fig-architecture.png) · 1600 × 1187 pixels

**Alt text:** Architecture diagram: Next.js browser pages and the PubNub JavaScript SDK exchange cheer notices with Pub/Sub and Runner/Cheer records with DataSync. Access Manager checks tokens. A separate server has session, timing and voice routes and no database. The drawing shows local key storage in .env.local.

**Detailed description:** The left side, labelled 'In the phone's browser', shows three small app screens for Maya, Mum and Sam under 'Next.js pages and the PubNub JavaScript SDK'. Green bidirectional arrows labelled 'notices' connect them to Pub/Sub in a large right-hand box labelled 'Your keyset'. Coral bidirectional arrows labelled 'records' connect them to DataSync. Pub/Sub carries cheer notices on cheers.&lt;slug&gt;; DataSync stores Runner and Cheer records, checks their schema and token, and emits events on each record's channel. Example ids are runner.&lt;slug&gt; and cheer.&lt;slug&gt;.&lt;key&gt;-&lt;n&gt;. A third right-hand panel says Access Manager checks every phone request and tokens come from grantToken. A lower-left 'Your server' box, marked 'No database', lists /api/timing for official times, /api/session for tokens, and /api/voice for reading cheers aloud. An amber arrow carries keys and a token to the phones. The footer says keys stay in .env.local on the server. This depicts local mode; the hosted Netlify demo delegates session, verification and timing operations to the private shared Access Manager.

**Visible labels and values:**

- `What runs where`
- `In the phone's browser`
- `Next.js pages and the PubNub JavaScript SDK`
- `Your keyset`
- `Pub/Sub · Cheer notices on cheers.<slug>`
- `DataSync · Runner and Cheer records`
- `Access Manager · Checks the token on every request from a phone`
- `Your server · No database`
- `/api/timing · writes official times`
- `/api/session · grants tokens`
- `/api/voice · reads cheers aloud`
- `The keys stay in .env.local on the server`

## fig-classes

**Two classes, three projections**

Image: [fig-classes.png](images/fig-classes.png) · 1600 × 1309 pixels

**Alt text:** Two schema tables compare Runner's default and phone projections with Cheer's default and private projections. Orange dots include a field; hollow circles omit it. Official timing fields are excluded from phone, and cheer message is excluded from default. Both classes expire after 172800 seconds from creation.

**Detailed description:** A DataSync/PROTECTED diagram contains two side-by-side tables. The Runner table uses id runner.&lt;slug&gt; and columns FIELD, TYPE, __default__ and phone. name is string; bib is nullable string; lat, lng and km are numbers; paceSec and elapsedSec are nullable numbers; fixAt is nullable datetime; trail is nullable string; status is string. All appear in both projections. Highlighted officialKm and officialSec are nullable numbers with filled orange circles under __default__ and hollow circles under phone. The Cheer table uses id cheer.&lt;slug&gt;.&lt;key&gt;-&lt;n&gt; and columns __default__ and private. runner is a filterable string; from is string; atKm is number; heardAt is nullable datetime; status is string. These appear in both projections. Highlighted message is string and appears only in private. Notes explain that supporters read the default view, the runner writes through phone, and the cheer's author and runner can read its words through private. Both classes set ttlSec to 172800, or two days from creation.

**Visible labels and values:**

- `Two classes, three projections`
- `Runner · runner.<slug>`
- `Cheer · cheer.<slug>.<key>-<n>`
- `FIELD · TYPE · __default__ · phone`
- `FIELD · TYPE · __default__ · private`
- `officialKm · number | null`
- `officialSec · number | null`
- `message · string`
- `runner · string · filter`
- `ttlSec: 172800`

## fig-tokens

**What each person's token allows**

Image: [fig-tokens.png](images/fig-tokens.png) · 1600 × 1168 pixels

**Alt text:** A permission matrix compares Maya's runner token with each supporter's token. Maya can create, read and update her run through phone and read/update cheers through private. Supporters read the run and all cheers through default, but create/read/update only their own three cheer slots through private. Both receive run events and exchange cheer notices.

**Detailed description:** The Access Manager/PROTECTED graphic has columns for Maya, the runner, and each supporter, illustrated by Mum, Sam and Theo avatars. For 'Her run', runner.&lt;slug&gt;, Maya has create, get and update through phone; supporters have get through __default__. For 'Every cheer for her', matched by the cheer-id pattern, Maya has get and update through private; supporters have get through __default__. The 'Their own three cheers' row names ids ending -1, -2 and -3: the supporter column has create, get and update through private. A dash in Maya's cell means she has no separate supporter-slot allocation; her preceding pattern grant already covers cheer reads and updates. Both columns have read on the runner.&lt;slug&gt; event channel and read/write on the cheers.&lt;slug&gt; notices channel. A footer says POST /api/session uses grantToken, tokens last 60 minutes and the Secret Key stays on the server. The figure omits the separate presence-channel row present in the full implementation.

**Visible labels and values:**

- `What each person's token allows`
- `Maya · THE RUNNER`
- `Each supporter · MUM, SAM, THEO`
- `Her run · runner.<slug>`
- `create · get · update · phone`
- `get · __default__`
- `Every cheer for her`
- `^cheer\.<slug>\..+$`
- `get · update · private`
- `Their own three cheers · cheer.<slug>.<key>-1, -2 and -3`
- `Her record's events · channel runner.<slug>`
- `Cheer notices · channel cheers.<slug>`
- `POST /api/session`
- `grantToken`
- `60 minutes`

## fig-one-write

**One write is checked, stored, and sent**

Image: [fig-one-write.png](images/fig-one-write.png) · 1600 × 1107 pixels

**Alt text:** Left-to-right flow: Maya PATCHes runner.maya with km 31.621, lat 52.1923 and lng 21.0444. DataSync checks schema and token, stores the record and emits an event. Mum, Sam and Theo all display 31.62 km. Failed schema or projection checks store nothing and return 400 DS-0650 or 403 DS-0202.

**Detailed description:** Maya's phone is on the left, above a PATCH runner.maya request with /payload/km 31.621, /payload/lat 52.1923 and /payload/lng 21.0444. A white arrow leads into a central DataSync container with four vertically stacked stages. 'Schema check' requires types and nullability to match the class; otherwise it shows 400 DS-0650 and 'Nothing is stored'. 'Token check' requires fields to be in Maya's projection; otherwise it shows 403 DS-0202 and the same storage outcome. 'Stored' says runner.maya holds the latest run. 'Event' says it is sent on the runner.maya channel. Green arrows branch to three dashboard crops on the right, labelled Mum's phone, Sam's phone and Theo's phone. Each shows Maya, bib 4127, updated just now, distance 31.62 km and pace 6:52/km. The left phone also shows race time 3:21:02. The id maya is an illustrative recording label; deployed runs use generated slugs.

**Visible labels and values:**

- `One write is checked, stored, and sent`
- `PATCH runner.maya`
- `/payload/km 31.621`
- `/payload/lat 52.1923`
- `/payload/lng 21.0444`
- `Schema check · 400 DS-0650`
- `Token check · 403 DS-0202`
- `Nothing is stored`
- `Stored · runner.maya holds the latest run`
- `Event · Sent on the runner.maya channel`
- `31.62 km`
- `6:52/km`

## fig-field-permissions

**Who may read or write each field**

Image: [fig-field-permissions.png](images/fig-field-permissions.png) · 1600 × 1147 pixels

**Alt text:** Two permission tables show different read and write projections. Sam's default cheer view contains from, atKm and status, but omits message; Maya's private view includes it. Leo's phone can write position and elapsed time but cannot write officialKm or officialSec. The organiser's server can write both timing fields.

**Detailed description:** The left panel, 'Reading a cheer', compares Sam's __default__ projection with Maya's private projection for the Cheer class. Filled amber dots show both receive from, atKm and status; the message row has a hollow circle for Sam and a filled dot for Maya. Recorded UI crops below show Sam's 'Mum · km 32.0 · only Maya hears this · Maya heard it' row without words, and Maya's row with the beginning of Mum's hiking encouragement and a heard badge. The right panel, 'Writing a run', compares Leo's phone projection with the organiser's server. Both can write lat, lng, km and elapsedSec; only the server column includes officialKm and officialSec. Leo attempts officialKm 42.195 and the red recorded error says '403 DS-0202 · Finish refused'; a green 200 example below says the server writes officialKm 30. Filled and hollow marks encode inclusion and omission. The reading comparison concerns another supporter, Sam; a cheer's own author can also read that cheer through private.

**Visible labels and values:**

- `Who may read or write each field`
- `Reading a cheer · Cheer`
- `Sam · __default__`
- `Maya · private`
- `from · atKm · status · message`
- `Writing a run · Runner`
- `Leo's phone · phone`
- `Organiser's server · server`
- `lat, lng, km · elapsedSec · officialKm · officialSec`
- `403 DS-0202 · Finish refused`
- `200 · The server writes officialKm 30`

## fig-reconnect

**Sam's phone drops out, then reads the record**

Image: [fig-reconnect.png](images/fig-reconnect.png) · 1600 × 1320 pixels

**Alt text:** A timeline shows Sam receiving writes at 39.97 and 39.99 km, missing nine events offline, then reading runner.maya once at 40.32 km before live events resume. Three phones show online, offline with the last position, and restored state. Missed events are not replayed.

**Detailed description:** The upper timeline labels Maya's writes and Sam's phone. Green markers at 39.97 and 39.99 km lead into nine hollow markers labelled '9 events while he was offline'. Sam's receiving line changes from solid green to dashed coral while disconnected. A blue marker at 40.32 km is labelled GET runner.maya; green event markers at 40.35 and 40.37 km follow it. The orange annotation says 'Offline. DataSync doesn't send these again.' Below are three recorded supporter screens. The first, 'Online 39.97 km', shows pace 6:24/km and time 4:14:48. The middle, 'Offline still 39.99 km', has a connection-lost banner and retains the previous map and time 4:14:57. The third, 'After one read 40.32 km', has a 'Restored from DataSync · 40.32 km' banner, pace 6:21/km, time 4:17:03 and a 40 km timing-mat badge. Arrows connect each screen to its point on the timeline. The recovery operation reads current state rather than replaying the nine missed events.

**Visible labels and values:**

- `Sam's phone drops out, then reads the record`
- `Maya's writes`
- `Sam's phone`
- `39.97 · 39.99`
- `9 events while he was offline`
- `GET runner.maya`
- `40.32 · 40.35 · 40.37`
- `Offline. DataSync doesn't send these again.`
- `Online · 39.97 km`
- `Offline · still 39.99 km`
- `After one read · 40.32 km`
- `Restored from DataSync · 40.32 km`

## fig-refused

**Two writes DataSync refuses**

Image: [fig-refused.png](images/fig-refused.png) · 1600 × 1173 pixels

**Alt text:** Two examples show whole writes rejected. A GPS PATCH sets lat and lng to null and gets 400 DS-0650; a subsequent GET retains lat 52.1923 and km 31.621. Leo's phone tries officialKm 42.195 and officialSec 9146 outside its projection and gets 403 DS-0202. Neither write changes stored state.

**Detailed description:** The left panel, 'A lost GPS fix', says lat is a number and cannot be null. A PATCH runner.maya box contains /payload/lat null, /payload/lng null and /payload/km 31.65. The response is 400 DS-0650 with the message 'Non-nullable field at /payload/lat is null or missing'. A GET immediately afterward shows lat 52.1923 and km 31.621 unchanged; the caption says nothing is stored and Maya's dot stays put. The right panel, 'A fake finish', says officialKm is not in the phone projection. Its PATCH runner.leo sends /payload/officialKm 42.195 and /payload/officialSec 9146, receives 403 DS-0202, and displays a recorded 'Finish refused' error. That error explains that official times come from the race's timing mats and supporters saw nothing. Both panels use red rejection badges and crossed-circle symbols to distinguish refused writes from successful writes.

**Visible labels and values:**

- `Two writes DataSync refuses`
- `A lost GPS fix`
- `Schema. lat is a number and can't be null.`
- `PATCH runner.maya`
- `/payload/lat null`
- `/payload/lng null`
- `/payload/km 31.65`
- `400 DS-0650`
- `GET runner.maya, right after`
- `lat 52.1923 unchanged`
- `km 31.621 unchanged`
- `A fake finish`
- `Token. officialKm isn't in the phone projection.`
- `PATCH runner.leo`
- `/payload/officialKm 42.195`
- `/payload/officialSec 9146`
- `403 DS-0202`
- `Finish refused`
- `Nothing stored. Supporters see nothing.`

## fig-cheer-flow

**A cheer is a record plus a notice**

Image: [fig-cheer-flow.png](images/fig-cheer-flow.png) · 1600 × 1347 pixels

**Alt text:** A six-step sequence diagram follows Mum, DataSync, Pub/Sub, Maya and Sam. Mum creates a private Cheer record, publishes its id on cheers.&lt;slug&gt;, and both recipients read it with their own projections. Maya receives and plays the words; Sam receives author and kilometre only. Maya stores heard status and publishes a heard notice to Mum.

**Detailed description:** Five vertical lifelines run left to right for Mum, DataSync, Pub/Sub, Maya and Sam; the Pub/Sub channel is cheers.&lt;slug&gt;. Step 1 is a coral createEntity arrow from Mum to DataSync through private. Step 2 is a green publish arrow carrying { type: 'pinned', id } from Mum to Pub/Sub. Step 3 fans green notice arrows out to Maya and Sam. Step 4 shows Maya calling getEntity through private and receiving a dashed amber return labelled 'the words', followed by a headphones icon and 'plays them'. Step 5 shows Sam calling getEntity through __default__ and receiving 'Mum, km 32, no words', with a lock icon. Step 6 shows Maya sending updateEntity with status heard, publishing a heard notice, and Mum receiving 'Maya heard it'. DataSync arrows represent stored records and permission-filtered reads; green Pub/Sub arrows represent notifications containing the record id rather than the private message text.

**Visible labels and values:**

- `A cheer is a record plus a notice`
- `Mum · DataSync · Pub/Sub · Maya · Sam`
- `cheers.<slug>`
- `1 · createEntity · private`
- `2 · publish { type: 'pinned', id }`
- `3 · notice`
- `4 · getEntity · private · the words · plays them`
- `5 · getEntity · __default__ · Mum, km 32, no words`
- `6 · updateEntity · status heard`
- `publish heard`
- `Maya heard it`

## fig-newest

**Keep the newest record**

Image: [fig-newest.png](images/fig-newest.png) · 1600 × 1013 pixels

**Alt text:** Five arrivals illustrate updatedAt ordering. The initial GET at 09:45:32.21 displays 31.62 km. An older event is skipped, a newer 31.65 km event is shown, its duplicate is skipped, and a 31.68 km event is shown. The code rejects records with timestamps less than or equal to the current record.

**Detailed description:** A left-to-right arrow labels this as an example arrival order from the simulated run. Five cards show: GET on open, updatedAt 09:45:32.21, 31.62 km, Shown; event 09:45:31.17, 31.59 km, Older, skipped; event 09:45:33.23, 31.65 km, Shown; event 09:45:33.23, 31.65 km, Same, skipped; event 09:45:34.17, 31.68 km, Shown. The 'On screen' row underneath reads 31.62, 31.62, 31.65, 31.65 and 31.68 km, demonstrating that stale or duplicate arrivals do not move the UI backward or redraw the same state. A code box says an event can arrive twice or after a newer read, followed by `if (current &amp;&amp; Date.parse(record.updatedAt) &lt;= Date.parse(current.updatedAt)) return`. Blue highlights the opening read, green accepted events, and muted grey the skipped arrivals.

**Visible labels and values:**

- `Keep the newest record`
- `An example arrival order, from the simulated run`
- `GET on open · 09:45:32.21 · 31.62 km · Shown`
- `event · 09:45:31.17 · 31.59 km · Older, skipped`
- `event · 09:45:33.23 · 31.65 km · Shown`
- `event · 09:45:33.23 · 31.65 km · Same, skipped`
- `event · 09:45:34.17 · 31.68 km · Shown`
- `if (current && Date.parse(record.updatedAt) <= Date.parse(current.updatedAt)) return`

## fig-message-state-record

**A message, state, or a record?**

Image: [fig-message-state-record.png](images/fig-message-state-record.png) · 1600 × 1053 pixels

**Alt text:** Three cards separate a momentary Pub/Sub notice, race-day DataSync state and a long-lived database result. The examples are Mum just cheered, Maya is at km 32.0, and Maya ran 4:28:41. A late-opening phone reads stored state; an earlier live notice is not delivered again in this demo.

**Detailed description:** Three side-by-side cards use green for Pub/Sub, coral for DataSync and grey for 'Your database'. The Pub/Sub card is titled 'A message', gives notice on cheers.maya, 'Mum just cheered', and says it matters for this moment; under 'Phone opens later', it says 'Doesn't get it'. The DataSync card is titled 'State', gives entity runner.maya, 'Maya is at km 32.0', and says it matters for race day, then expires; a late-opening phone 'Reads it when it opens'. The database card is titled 'A record', gives '2026 results table', 'Maya ran 4:28:41', and says it matters for years; later, 'Your server looks it up'. Horizontal duration bars grow from a small green point to a partial coral bar to a long grey bar. The footer states the demo's rule: if a phone that opens later needs it, it is state and goes in DataSync. This is a design distinction for the demo, not a claim that Pub/Sub can never be used with a history service.

**Visible labels and values:**

- `Where each piece of race data goes`
- `A message, state, or a record?`
- `Pub/Sub · A message · notice on cheers.maya · Mum just cheered`
- `This moment · Doesn't get it`
- `DataSync · State · entity runner.maya · Maya is at km 32.0`
- `Race day, then it expires · Reads it when it opens`
- `Your database · A record · 2026 results table · Maya ran 4:28:41`
- `Years · Your server looks it up`

## fig-compare

**A real-time database or DataSync?**

Image: [fig-compare.png](images/fig-compare.png) · 1600 × 1291 pixels

**Alt text:** A two-column comparison lists storage model, lifetime, change subscriptions, permissions, queries, reconnection and Pub/Sub integration. The database column emphasizes durable records and rich queries. The DataSync column emphasizes typed expiring entities, per-field token projections, entity-channel events, filtered class reads and the same PubNub keyset, SDK and tokens.

**Detailed description:** The left column is 'Real-time database', subtitled 'A database first'; the highlighted right column is 'DataSync', subtitled 'App state, next to Pub/Sub'. Row pairs are: records in the database's own data model versus typed entities of classes you define; until deletion versus 31 days by default, set per class and counted from creation, with updates not extending it; subscriptions to a record or query versus the entity's channel, each event carrying the current record; rules or policies you write versus tokens with projections per field; rich queries across records versus one entity by id or a filtered list, one class at a time and 100 a page; often a local cache syncing back versus reading the record then following events; a second service and SDK next to Pub/Sub versus the same keyset, SDK and tokens. Bottom tags list Accounts, Orders, History and Search for databases, and Live state, Late joiners and Per-field access for DataSync. These are the comparison claims printed in the illustration; the demo's own class TTL is two days.

**Visible labels and values:**

- `A real-time database or DataSync?`
- `STORES · LIFETIME · CHANGES · PERMISSIONS · QUERIES · AFTER A DISCONNECT · NEXT TO PUB/SUB · BEST FOR`
- `Records in its own data model`
- `Typed entities of classes you define`
- `31 days by default, set per class`
- `Counted from creation. Updates don't extend it.`
- `Subscribe to the entity's channel`
- `Tokens with projections, per field`
- `One entity by id, or a filtered list`
- `One class at a time, 100 a page`
- `Read the record, then follow events`
- `The same keyset, SDK and tokens`
- `Accounts · Orders · History · Search`
- `Live state · Late joiners · Per-field access`

## why-datasync

**Why DataSync?**

Image: [why-datasync.png](images/why-datasync.png) · 1920 × 1080 pixels

**Alt text:** A three-row comparison explains Store it, Protect it and Restore it. Without DataSync the developer runs a database, writes permission checks and writes catch-up code. The DataSync column says state is stored once, permissions are per field and one read returns the latest state. A banner distinguishes live Pub/Sub cheers from stored race state.

**Detailed description:** A landscape slide on navy starts 'Why DataSync?' and says 'Pub/Sub makes the cheers live, but the race is state, and phones lose signal'. Beneath it, the left column is 'Without DataSync · You build and run it' and the right is 'DataSync · Handled for you'. Three colour-coded rows compare work and outcome. Coral 'Store it · where every runner is' pairs 'A database you set up and run' with 'Stored once, every phone in sync'. Amber 'Protect it · who may change what' pairs 'Permission checks you write' with 'Field-level permissions'. Blue 'Restore it · when a phone loses signal' pairs 'Catch-up code you write' with 'One read: the latest state'. Green check marks identify the three DataSync outcomes. The last row describes reading stored state after reconnection; the app still performs that read in client code.

**Visible labels and values:**

- `Why DataSync?`
- `Pub/Sub makes the cheers live`
- `but the race is state, and phones lose signal`
- `Without DataSync · YOU BUILD AND RUN IT`
- `DataSync · HANDLED FOR YOU`
- `Store it · where every runner is`
- `A database you set up and run`
- `Stored once, every phone in sync`
- `Protect it · who may change what`
- `Permission checks you write`
- `Field-level permissions`
- `Restore it · when a phone loses signal`
- `Catch-up code you write`
- `One read: the latest state`

## live-cheer-over-pubsub

**A live cheer reaches Maya's headphones**

Image: [live-cheer-over-pubsub.png](images/live-cheer-over-pubsub.png) · 1920 × 1080 pixels

**Alt text:** Two recorded phones show Mum's live cheer and Maya's playback at 32.11 km. Mum's screen is labelled Maya is hearing it; Maya's red overlay displays the full hiking encouragement. A headphones icon and waveform represent spoken audio, with elapsed race time 3:24:26 in the progress strip.

**Detailed description:** This landscape film frame shares the cover's 'A cheer from 300 km away, sent live' title and Pub/Sub/LIVE badges, but captures a later instant. The left phone is labelled Mum, 'Maya is hearing it', and its dashboard shows Maya at 32.11 km, pace 6:58/km, time 3:24:26, three following and about 70 minutes to the finish. Its map contains Mum's cheer at km 32.0 and Maya's current marker. The right phone is labelled Maya, km 32, and covered by a red playback card headed 'FROM MUM · KM 32.0'. It displays: 'Remember that hike in the rain? You wanted to turn back, and we made it to the top together. Keep going, love.' Coral waveform bars and a headphones icon with 'IN HER HEADPHONES' make the audio visible. The upper-right progress strip reads 32.11 km and 3:24:26. Unlike the cover frame's 'at home' label, this frame explicitly shows the playback state at Mum's side.

**Visible labels and values:**

- `A cheer from 300 km away, sent live`
- `Mum · Maya is hearing it`
- `Maya · km 32`
- `32.11 km`
- `6:58/km`
- `3:24:26`
- `FROM MUM · KM 32.0`
- `Remember that hike in the rain? You wanted to turn back, and we made it to the top together. Keep going, love.`
- `IN HER HEADPHONES`

## phone-cant-write-official-time

**Phones cannot write official times**

Image: [phone-cant-write-official-time.png](images/phone-cant-write-official-time.png) · 1920 × 1080 pixels

**Alt text:** Leo's phone at 24.09 km displays Finish refused. A PATCH example attempts officialKm 42.195 and officialSec 9146, then receives 403 DS-0202 with nothing saved. The caption explains that a runner's phone can write position but cannot write official timing fields.

**Detailed description:** A landscape DataSync/PROTECTED frame is titled 'Phones can't write official times'. On the left is Leo's phone, labelled 'his phone · km 24', with a map placing him near the course's marked finish. His dashboard reads 24.09 km, 6:18/km and 2:32:26. A red outlined error card says 403 DS-0202, 'Finish refused', and explains that the phone tried to record a finish at km 42.2, while official times come only from timing mats. On the right, 'His phone sends' and 'a fake finish' introduce a PATCH /entities/runner.j8ke… example with paths /payload/officialKm set to 42.195 and /payload/officialSec set to 9146. Below, a coral crossed-circle statement says '403 DS-0202 · refused, nothing saved'. A lower callout says field-level permissions let the runner's phone write its position, never an official time. The restriction is on official fields, not a validation that a client's reported coordinates or distance are truthful.

**Visible labels and values:**

- `Phones can't write official times`
- `Leo · his phone · km 24`
- `24.09 km`
- `6:18/km`
- `2:32:26`
- `His phone sends · a fake finish`
- `PATCH /entities/runner.j8ke…`
- `/payload/officialKm · 42.195`
- `/payload/officialSec · 9146`
- `403 DS-0202 · refused, nothing saved`
- `Finish refused`

## private-field

**Different tokens receive different cheer fields**

Image: [private-field.png](images/private-field.png) · 1920 × 1080 pixels

**Alt text:** Sam's phone shows Mum cheered at km 32.0 but omits her words. Two comparison cards show Sam receiving the author and kilometre while Maya receives the words for headphone playback. The race strip reads 32.20 km and 3:25:02. The cheer author also retains access to her own words under the demo's full token rules.

**Detailed description:** The DataSync/PROTECTED film frame is headed 'Only Maya's phone gets the words'. A left phone is labelled Sam, 'on his way to the finish'. It shows Maya, bib 4127, at 32.20 km, pace 6:48/km and time 3:25:02. The highlighted cheer row reads Mum, km 32.0, 'only Maya hears this', and 'Maya heard it', with no message text. Two large right-hand cards contrast 'Sam's phone got: Mum cheered · km 32.0; the words: not sent' with 'Maya's phone got: Mum cheered · km 32.0; the words, read in her headphones'. A footer says the cheer is one DataSync record and its words are a private field. The headline and footer are shorthand for this Sam-versus-Maya comparison: in the actual token grants Mum, the cheer's author, can also read her own message through her exact private cheer slot. The description preserves that distinction rather than treating the illustration as a complete permission matrix.

**Visible labels and values:**

- `Only Maya's phone gets the words`
- `Sam · on his way to the finish`
- `32.20 km`
- `6:48/km`
- `3:25:02`
- `Sam's phone got`
- `Mum cheered · km 32.0`
- `the words: not sent`
- `Maya's phone got`
- `the words, read in her headphones`
- `only Maya hears this`
- `Maya heard it`

## reload-reads-latest-state

**One reload reads the latest race state**

Image: [reload-reads-latest-state.png](images/reload-reads-latest-state.png) · 1920 × 1080 pixels

**Alt text:** A GET example reads a running entity with km 40.322, elapsedSec 15423 and an encoded trail. Beside it Sam's restored phone shows 40.32 km, pace 6:21/km, time 4:17:03 and a Restored from DataSync banner. It recovers the current record rather than replaying missed updates.

**Detailed description:** The landscape DataSync/RESTORED frame is headed 'One reload: the race, right where it is'. A left card says 'His reload reads' and 'the latest state', followed by GET /entities/runner.s634… and an abbreviated record containing status 'running', km 40.322, elapsedSec 15423 and trail '…'. The kilometre line is highlighted green. On the right, Sam's phone is labelled 'back online'; a green banner across its course map says 'Restored from DataSync · 40.32 km'. The supporter dashboard shows Maya, bib 4127, three following, 40.32 km, pace 6:21/km, time 4:17:03 and about 12 minutes to the finish. A timing badge shows the 40 km mat at 4:15:01. The upper-right progress strip repeats 40.32 km and 4:17:03. The JSON is a visual excerpt rather than a complete DataSync response envelope; the implemented payload fields live under payload.

**Visible labels and values:**

- `One reload: the race, right where it is`
- `His reload reads · the latest state`
- `GET /entities/runner.s634…`
- `status: running`
- `km: 40.322`
- `elapsedSec: 15423`
- `trail: …`
- `Sam · back online`
- `Restored from DataSync · 40.32 km`
- `40.32 km`
- `6:21/km`
- `4:17:03`
- `Timing mat 40 km · 4:15:01`

## fig-strava-export

**Save the finished run as GPX or upload it to Strava**

Image: [fig-strava-export.png](images/fig-strava-export.png) · 1600 × 1379 pixels

**Alt text:** Three illustrated app screens show End run, a finished 4.98 km run with Save GPX and Connect with Strava, then a View on Strava link. The image explains the export flow; it is not evidence of a live Strava upload.

**Detailed description:** A navy diagram headed After the finish, the run goes to Strava has three numbered columns connected by white arrows. End the run highlights End run on a phone showing 4.59 km, pace 6:11/km and time 28:55. Save it or send it shows a finished 4.98 km run, pace 6:53/km and time 31:41, with Save GPX and Connect with Strava highlighted. On Strava shows the same finish card with View on Strava highlighted; it is still the app screen, not a Strava activity page. Mum's km 2.0 cheer is marked heard. A footer says the full track stays on the runner's phone while DataSync keeps the simplified trail, and simulated runs can save a labeled file but never go to Strava. The illustration explains the optional configured flow, not a verified upload to a live account.

**Visible labels and values:**

- `AN EXTRA IN THE DEMO APP`
- `After the finish, the run goes to Strava`
- `End the run`
- `Save it or send it`
- `On Strava`
- `End run`
- `4.98 km`
- `6:53/km`
- `31:41`
- `You finished`
- `Save GPX`
- `Connect with Strava`
- `View on Strava`
- `Back to the race`
