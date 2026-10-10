import type { ProfileClock } from '../../contracts'
import { ProfileFailure } from '../../contracts'

/**
 * PRIVATE. The current time, from the host's clock (docs/contracts.md §16).
 * Every time Profile keeps or judges comes from here. A clock that throws or
 * answers anything but a valid `Date` fails the operation closed as
 * `unavailable`: Profile never falls back to another time.
 */

/** The system clock, used when the host supplies none. */
export const systemProfileClock: ProfileClock = Object.freeze({ now: () => new Date() })

/** The clock's time, validated, as a fresh `Date` the caller may keep. */
export function timeFrom(clock: ProfileClock): Date {
  let answer: unknown
  try {
    answer = clock.now()
  }
  catch {
    throw new ProfileFailure('unavailable', 'clock failed')
  }
  if (!(answer instanceof Date) || !Number.isFinite(answer.getTime())) throw new ProfileFailure('unavailable', 'clock answered an invalid time')
  return new Date(answer.getTime())
}
