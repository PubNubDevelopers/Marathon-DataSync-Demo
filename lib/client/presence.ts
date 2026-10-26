'use client'
import { useEffect, useState } from 'react'
import type PubNub from 'pubnub'

// Counts supporters on the notices channel with Presence. Supporters' user ids
// start with "supporter-", so the runner's own connection isn't counted.
export function usePresence(pubnub: PubNub | null, channel: string) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!pubnub) return
    const here = new Set<string>()
    const update = () => setCount([...here].filter((u) => u.startsWith('supporter-')).length)

    const sub = pubnub.channel(channel).subscription({ receivePresenceEvents: true })
    sub.onPresence = (e) => {
      if (e.action === 'join' && e.uuid) here.add(e.uuid)
      else if ((e.action === 'leave' || e.action === 'timeout') && e.uuid) here.delete(e.uuid)
      else if (e.action === 'interval') {
        for (const u of e.join ?? []) here.add(u)
        for (const u of [...(e.leave ?? []), ...(e.timeout ?? [])]) here.delete(u)
      }
      update()
    }
    sub.subscribe()

    pubnub
      .hereNow({ channels: [channel], includeUUIDs: true })
      .then((res) => {
        for (const o of res.channels[channel]?.occupants ?? []) here.add(o.uuid)
        update()
      })
      .catch(() => {})

    return () => sub.unsubscribe()
  }, [pubnub, channel])

  return count
}
