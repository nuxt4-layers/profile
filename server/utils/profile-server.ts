import type { DisplayName, IdentityEventLike, ProfileAttributes, ProfileEventPublisher } from '../../contracts'
import { ProfileFailure } from '../../contracts'
import { runProfileMigrations } from '../database/migrations'
import type { DepartureExport, OwnProfile } from '../internal/service'
import { createService } from '../internal/service'
import { useProfileDatabase, useProfileDisclosureContext, useProfileKeyWrapper } from './profile-composition'

/**
 * PUBLIC server functions (auto-imported for the host's server code). Each
 * takes the person (`subjectId`) or the viewer (`viewerId`) from the caller,
 * which must take it from the signed-in principal, never from a request
 * body. Every one fails closed with `ProfileFailure`.
 */

let migration: Promise<string[]> | null = null

/**
 * Applies pending migrations to Profile's schema, through the migration pool
 * when supplied (then granting the runtime role). Call once from the host's
 * Nitro plugin after `provideProfileDatabase`; operations wait for it.
 */
export function migrateProfileDatabase(): Promise<string[]> {
  const database = useProfileDatabase()
  migration = runProfileMigrations(database.migrationPool ?? database.pool, database.schema, database.runtimeRole)
  migration.catch((error) => {
    console.error('[profile] database migrations failed:', error instanceof Error ? error.message : error)
  })
  return migration
}

async function service() {
  if (migration) await migration.catch(() => { throw new ProfileFailure('unavailable', 'migrations failed') })
  const database = useProfileDatabase()
  return createService({ pool: database.pool, schema: database.schema, keys: useProfileKeyWrapper(), disclosure: useProfileDisclosureContext })
}

/** The person's own record and disclosure settings; null once erased. */
export async function getOwnProfile(input: { subjectId: string }): Promise<OwnProfile | null> {
  return (await service()).own(input)
}

/** The person changes their own attributes (a value sets, `null` removes). */
export async function updateProfile(input: { subjectId: string, changes: unknown, correlationId: string }): Promise<OwnProfile> {
  return (await service()).update(input)
}

/** The person sets each attribute's audience, the name others see, and their departure choice. */
export async function setProfileDisclosure(input: { subjectId: string, settings: unknown, correlationId: string }): Promise<OwnProfile> {
  return (await service()).setDisclosure(input)
}

/** The person chooses to be shown as "Former member" in a group they left. */
export async function anonymiseProfileDeparture(input: { subjectId: string, groupId: string, correlationId: string }): Promise<void> {
  return (await service()).anonymiseDeparture(input)
}

/** Display names for up to 200 people as the viewer may see them, for attribution or a listing. */
export async function lookupProfileDisplayNames(input: { viewerId: string, subjectIds: string[], groupId?: string | null, purpose: 'attribution' | 'listing' }): Promise<{ subjectId: string, displayName: DisplayName }[]> {
  return (await service()).displayNames(input)
}

/** One person's profile as the viewer may see it now. */
export async function viewProfile(input: { viewerId: string, subjectId: string, groupId?: string | null }): Promise<{ subjectId: string, displayName: DisplayName, attributes: ProfileAttributes }> {
  return (await service()).view(input)
}

/** Profile's part of a data-subject export; null once erased. */
export async function exportProfileData(input: { subjectId: string }): Promise<{ attributes: ProfileAttributes, settings: OwnProfile['settings'], departures: DepartureExport[] } | null> {
  return (await service()).exportData(input)
}

/** Applies one relayed Identity event: provisioning, a membership ending, or closure. */
export async function applyProfileIdentityEvent(event: IdentityEventLike): Promise<'applied' | 'duplicate' | 'ignored'> {
  return (await service()).applyIdentityEvent(event)
}

/** Erases a person's record and destroys their key, with a reason code. */
export async function eraseProfile(input: { identityId: string, reasonCode: string, correlationId: string }): Promise<boolean> {
  return (await service()).erase(input)
}

/** Maintenance: re-wraps keys still under an older wrapping-key version. */
export async function rewrapProfileKeys(input: { limit?: number } = {}): Promise<number> {
  return (await service()).rewrapKeys(input)
}

/** How many live keys each wrapping-key version still protects. */
export async function profileKeyVersionsInUse(): Promise<{ version: string, keys: number }[]> {
  return (await service()).keyVersionsInUse()
}

/** Publishes pending outbox events in order, through the host's publisher. */
export async function relayProfileOutbox(input: { publish: ProfileEventPublisher, limit?: number }): Promise<number> {
  return (await service()).relayOutbox(input)
}
