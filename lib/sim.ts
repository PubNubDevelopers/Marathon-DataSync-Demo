// The simulated race: the Riverside Marathon course at a pace that depends only on
// distance, so every simulated run tells the same story. The runner, a first-timer,
// holds about 6:19/km, slows from km 28 to about 6:58 at km 32, and a cheer heard
// after km 30 lifts her back to about 6:24. Simulated time runs SIM_SPEED times faster
// than the clock by default; demos can change it.

import { COURSE_KM } from '@/lib/course'

export const SIM_SPEED = 30
export const WIND_FROM_KM = 30

const START = 392 // s/km, the crowded first kilometre
const STEADY = 379
const WALL = 418
const SECOND_WIND = 384
const WALL_FROM_KM = 28
const WALL_AT_KM = 32
const KICK_FROM_KM = 41 // the crowd at the finish straight
const KICK = 362
const WIND_RAMP_KM = 0.4

// A little unevenness, so the pace reads like a real one.
const wobble = (km: number) => 4 * Math.sin(km * 5.9) + 2.5 * Math.sin(km * 17.3)

const base = (km: number) =>
  km < 1 ? START : km < WALL_FROM_KM ? STEADY : km < WALL_AT_KM ? STEADY + ((WALL - STEADY) * (km - WALL_FROM_KM)) / (WALL_AT_KM - WALL_FROM_KM) : WALL

/** Pace in seconds per km at distance km. windAt is where a cheer lifted her, if one did. */
export function simPace(km: number, windAt: number | null) {
  let pace = base(km)
  if (windAt != null && km >= windAt) {
    const from = base(windAt)
    pace = from + (SECOND_WIND - from) * Math.min(1, (km - windAt) / WIND_RAMP_KM)
  }
  if (km >= KICK_FROM_KM) pace = Math.min(pace, KICK + (pace - KICK) * Math.max(0, 1 - (km - KICK_FROM_KM) / 0.3))
  return pace + wobble(km)
}

/**
 * Advances a run by `dt` simulated seconds. Returns the new distance and time.
 * When the run reaches the finish, the time is where it crossed the line.
 */
export function advance(km: number, sec: number, dt: number, windAt: number | null) {
  let left = dt
  while (left > 0 && km < COURSE_KM) {
    const step = Math.min(left, 1)
    const pace = simPace(km, windAt)
    const dkm = step / pace
    if (km + dkm >= COURSE_KM) {
      sec += (COURSE_KM - km) * pace
      km = COURSE_KM
      break
    }
    km += dkm
    sec += step
    left -= step
  }
  return { km, sec }
}

/** The simulated time at which the runner reaches `target` km from `km`, `sec`. */
export function timeTo(km: number, sec: number, target: number, windAt: number | null) {
  while (km < target && km < COURSE_KM) {
    const pace = simPace(km, windAt)
    const dkm = Math.min(target - km, 0.01)
    sec += dkm * pace
    km += dkm
  }
  return { km: Math.min(target, COURSE_KM), sec }
}
