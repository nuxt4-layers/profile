import { z } from 'zod'
import { PROFILE_ATTRIBUTES } from './attributes'
import { correlationIdSchema, identifierSchema, instantSchema, reasonCodeSchema } from './identifiers'

/**
 * Profile's events (docs/contracts.md §8). Each is written to Profile's
 * outbox in the same transaction as the change; the host relays them.
 * Delivery is at least once: consumers are idempotent by `eventId`.
 *
 * Events carry opaque identifiers, attribute names and codes only: never a
 * value from the record.
 */

const id = identifierSchema

const payloads = {
  /** A record exists for the identity (empty until the person fills it). */
  'profile.created': z.strictObject({ identityId: id }),
  /** The person changed attributes or their disclosure; names only, never values. */
  'profile.changed': z.strictObject({ identityId: id, attributes: z.array(z.enum(PROFILE_ATTRIBUTES)).max(PROFILE_ATTRIBUTES.length), disclosure: z.boolean() }),
  /** The person chose anonymity in a group they left: drop any name cached for them there. */
  'profile.departure-anonymised': z.strictObject({ identityId: id, groupId: id }),
  /** The record was erased and its key destroyed: drop every name cached for the identity. */
  'profile.anonymised': z.strictObject({ identityId: id, reasonCode: reasonCodeSchema }),
} as const

export type ProfileEventType = keyof typeof payloads
export const PROFILE_EVENT_TYPES = Object.freeze(Object.keys(payloads) as ProfileEventType[])

function eventSchema<T extends ProfileEventType>(type: T) {
  return z.strictObject({
    /** UUIDv7; consumers are idempotent by it. */
    eventId: id,
    type: z.literal(type),
    occurredAt: instantSchema,
    correlationId: correlationIdSchema,
    data: payloads[type],
  })
}

export const profileEventSchema = z.discriminatedUnion(
  'type',
  PROFILE_EVENT_TYPES.map(type => eventSchema(type)) as unknown as [ReturnType<typeof eventSchema>, ...ReturnType<typeof eventSchema>[]],
)

export type ProfileEvent = {
  [T in ProfileEventType]: { eventId: string, type: T, occurredAt: string, correlationId: string, data: z.infer<(typeof payloads)[T]> }
}[ProfileEventType]

export const PROFILE_EVENT_PAYLOADS: Readonly<Record<ProfileEventType, z.ZodType>> = Object.freeze(payloads)

/**
 * The Identity events Profile acts on: a record for each new identity, a
 * departure snapshot when a membership ends, and erasure when an identity
 * closes. Profile reads pausing and suspension from the disclosure-context
 * port at each lookup instead, so it never shows a stale standing.
 */
export const IDENTITY_EVENTS_HANDLED = Object.freeze(['identity.provisioned', 'membership.ended', 'identity.closed'] as const)
