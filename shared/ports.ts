import type { DisclosureContext } from './disclosure'
import type { ProfileEvent } from './events'

/**
 * Ports the host supplies (docs/composition-contract.md). Declared
 * structurally, so the contract depends on no driver, key service or other
 * capability's package.
 */

/** Structural shape of a `pg` pool. */
export interface PostgresPoolLike {
  query(text: string, values?: readonly unknown[]): Promise<unknown>
  connect(): Promise<unknown>
}

/**
 * Persistence (ADR-0002, ADR-0006). `pool` connects as the runtime role.
 * Migrations run through `migrationPool` when given (the role that owns the
 * schema), which then grants the runtime role only what it needs.
 */
export interface ProfileDatabase {
  dialect: 'postgres'
  pool: PostgresPoolLike
  /** Schema owned by this capability. Defaults to `profile`. */
  schema?: string
  migrationPool?: PostgresPoolLike
  /** The runtime role to grant, when migrations run as another role. */
  runtimeRole?: string
}

/** A person's data key, wrapped by the host. */
export interface WrappedProfileKey {
  /** The wrapping key's version, e.g. `2026-10`. */
  version: string
  /** The wrapped key, base64. */
  wrapped: string
}

/**
 * Key-wrapping port (docs/contracts.md §6). Profile generates one 256-bit
 * key per person and stores it only as wrapped here: by a KMS, an HSM or a
 * vault in production. The wrapping key is versioned so that the host can
 * rotate it: `rewrapProfileKeys()` moves every live key to the current
 * version, and once no key and no backup still needs an old version, the
 * host retires it. An erased person's key is never re-wrapped, so their
 * data in older backups becomes unreadable when that version is retired.
 *
 * `context.identityId` must be bound to the wrapping (as additional
 * authenticated data), so a wrapped key cannot be moved to another person.
 * A failure rejects, and Profile fails closed.
 */
export interface ProfileKeyWrapper {
  /** The version new keys are wrapped with. */
  currentVersion(): string
  wrap(key: Uint8Array, context: { identityId: string }): Promise<WrappedProfileKey>
  unwrap(key: WrappedProfileKey, context: { identityId: string }): Promise<Uint8Array>
}

export interface DirectoryReadOptions {
  consistency: 'strong' | 'bounded'
}

/**
 * Identity's disclosure-context port, as the host passes it in (Identity
 * contract §10.3). Normally read `bounded`. A failure rejects, and Profile
 * then shows nothing rather than something stale.
 */
export interface ProfileDisclosureContextPort {
  describe(
    request: { viewerId: string, subjectIds: string[], groupId: string | null },
    options: DirectoryReadOptions,
  ): Promise<DisclosureContext>
}

/** An Identity event as the host relays it. Profile reads only what it handles. */
export interface IdentityEventLike {
  eventId: string
  type: string
  occurredAt: string
  correlationId: string
  data: Record<string, unknown>
}

/** Where `relayProfileOutbox` delivers events. A rejection leaves the event to be relayed again. */
export type ProfileEventPublisher = (event: ProfileEvent) => Promise<void>
