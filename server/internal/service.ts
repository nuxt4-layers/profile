import type {
  DepartureFacts,
  DisclosureContext,
  DisclosureSettings,
  DisplayName,
  IdentityEventLike,
  LookupPurpose,
  PostgresPoolLike,
  ProfileAttribute,
  ProfileAttributes,
  ProfileDisclosureContextPort,
  ProfileEvent,
  ProfileEventPublisher,
  ProfileEventType,
  ProfileKeyWrapper,
  ProfileOwnView,
} from '../../contracts'
import {
  chosenDisplayName,
  correlationIdSchema,
  DEFAULT_DISCLOSURE_SETTINGS,
  disclosureContextSchema,
  disclosureSettingsSchema,
  discloseAttributes,
  discloseDisplayName,
  DISCLOSURE_MAX_SUBJECTS,
  identifierSchema,
  LOOKUP_PURPOSES,
  PROFILE_LOOKUP_RATE_LIMIT,
  PROFILE_ATTRIBUTES,
  profileAttributesSchema,
  profileChangesSchema,
  ProfileFailure,
  reasonCodeSchema,
  VERIFICATION_CLAIMS,
} from '../../contracts'
import type { PoolClientLike } from '../database/migrations'
import { quoteSchema } from '../database/migrations'
import { aad, newDataKey, open, seal, uuidv7 } from './crypto'

/**
 * PRIVATE. Profile's server operations. Every attribute value is encrypted
 * with the person's own key before it reaches the database, and decrypted
 * only to answer the person or a viewer the disclosure rules allow. Any
 * failure of the database, the key port or Identity's port fails closed
 * (`ProfileFailure('unavailable')`), and no error or log carries a value.
 */

export interface ServiceDependencies {
  pool: PostgresPoolLike
  schema: string
  keys: ProfileKeyWrapper
  /** Identity's disclosure-context port; required for lookups by other people. */
  disclosure: () => ProfileDisclosureContextPort
  now?: () => Date
}

export type OwnProfile = ProfileOwnView

export interface DepartureExport {
  groupId: string
  endedAt: string
  name: string | null
  pseudonym: number | null
  anonymised: boolean
}

type Client = PoolClientLike

function openOrFail(key: Uint8Array, sealed: Uint8Array, additional: string): string {
  try {
    return open(key, sealed, additional)
  }
  catch {
    throw new ProfileFailure('unavailable', 'stored value is malformed')
  }
}

function parse<T>(run: () => T): T {
  try {
    return run()
  }
  catch (error) {
    const issues = (error as { issues?: { message: string }[] }).issues
    const codes = issues ? [...new Set(issues.map(issue => issue.message))].join(',') : 'invalid input'
    throw new ProfileFailure('validation-failed', codes)
  }
}

export function createService({ pool, schema, keys, disclosure, now = () => new Date() }: ServiceDependencies) {
  const s = quoteSchema(schema)

  async function transaction<T>(run: (client: Client) => Promise<T>): Promise<T> {
    let client: Client
    try {
      client = await pool.connect() as Client
    }
    catch {
      throw new ProfileFailure('unavailable', 'database connection failed')
    }
    try {
      await client.query('begin')
      const result = await run(client)
      await client.query('commit')
      return result
    }
    catch (error) {
      await client.query('rollback').catch(() => {})
      if (error instanceof ProfileFailure) throw error
      throw new ProfileFailure('unavailable', 'database operation failed')
    }
    finally {
      client.release()
    }
  }

  function event<T extends ProfileEventType>(type: T, data: Extract<ProfileEvent, { type: T }>['data'], correlationId: string): ProfileEvent {
    const at = now()
    return { eventId: uuidv7(at.getTime()), type, occurredAt: at.toISOString(), correlationId, data } as ProfileEvent
  }

  async function emit(client: Client, profileEvent: ProfileEvent): Promise<void> {
    await client.query(`insert into ${s}."outbox" ("event") values ($1::jsonb)`, [JSON.stringify(profileEvent)])
  }

  async function unwrap(identityId: string, version: string, wrapped: string): Promise<Uint8Array> {
    try {
      return await keys.unwrap({ version, wrapped }, { identityId })
    }
    catch {
      throw new ProfileFailure('unavailable', 'key unwrapping failed')
    }
  }

  async function isErased(client: Client, identityId: string): Promise<boolean> {
    const { rows } = await client.query(`select 1 from ${s}."erased" where "identity_id" = $1`, [identityId])
    return rows.length > 0
  }

  /** Creates an empty record with a new key, unless one exists or the identity was erased. */
  async function ensureRecord(client: Client, identityId: string, correlationId: string): Promise<'exists' | 'created' | 'erased'> {
    if (await isErased(client, identityId)) return 'erased'
    const { rows } = await client.query(`select 1 from ${s}."record" where "identity_id" = $1`, [identityId])
    if (rows.length > 0) return 'exists'
    const key = newDataKey()
    let wrapped
    try {
      wrapped = await keys.wrap(key, { identityId })
    }
    catch {
      throw new ProfileFailure('unavailable', 'key wrapping failed')
    }
    const inserted = await client.query(
      `insert into ${s}."subject_key" ("identity_id", "key_version", "wrapped_key") values ($1, $2, $3) on conflict do nothing returning 1`,
      [identityId, wrapped.version, wrapped.wrapped],
    )
    if (inserted.rows.length === 0) return 'exists'
    await client.query(
      `insert into ${s}."record" ("identity_id", "ciphertext", "disclosure") values ($1, $2, $3::jsonb)`,
      [identityId, seal(key, '{}', aad.record(identityId)), JSON.stringify(DEFAULT_DISCLOSURE_SETTINGS)],
    )
    await emit(client, event('profile.created', { identityId }, correlationId))
    return 'created'
  }

  interface StoredRecord { key: Uint8Array, attributes: ProfileAttributes, settings: DisclosureSettings, version: number }

  /** Refuses a change made against an older version than the one stored (0 when none is). Locks the row. */
  async function checkVersion(client: Client, identityId: string, expected: number | undefined): Promise<void> {
    if (expected === undefined) return
    const { rows } = await client.query(`select "version" from ${s}."record" where "identity_id" = $1 for update`, [identityId])
    const current = (rows[0]?.version as number | undefined) ?? 0
    if (current !== expected) throw new ProfileFailure('conflict', 'version-changed')
  }

  const expectedVersionOf = (value: unknown): number | undefined =>
    value === undefined ? undefined : parse(() => { if (!Number.isInteger(value) || (value as number) < 0) throw new Error('invalid'); return value as number })

  async function decodeRecord(identityId: string, row: Record<string, unknown>): Promise<StoredRecord> {
    const key = await unwrap(identityId, row.key_version as string, row.wrapped_key as string)
    try {
      return {
        key,
        attributes: profileAttributesSchema.parse(JSON.parse(open(key, row.ciphertext as Uint8Array, aad.record(identityId)))),
        settings: disclosureSettingsSchema.parse(row.disclosure),
        version: row.version as number,
      }
    }
    catch {
      throw new ProfileFailure('unavailable', 'stored record is malformed')
    }
  }

  async function readRecord(client: Client | PostgresPoolLike, identityId: string, lock = false): Promise<StoredRecord | null> {
    const { rows } = await client.query(
      `select r."ciphertext", r."disclosure", r."version", k."key_version", k."wrapped_key"
       from ${s}."record" r join ${s}."subject_key" k using ("identity_id") where r."identity_id" = $1${lock ? ' for update of r' : ''}`,
      [identityId],
    ) as { rows: Record<string, unknown>[] }
    return rows[0] ? decodeRecord(identityId, rows[0]) : null
  }

  async function writeRecord(client: Client, identityId: string, record: StoredRecord): Promise<void> {
    await client.query(
      `update ${s}."record" set "ciphertext" = $2, "disclosure" = $3::jsonb, "version" = "version" + 1, "updated_at" = now() where "identity_id" = $1`,
      [identityId, seal(record.key, JSON.stringify(record.attributes), aad.record(identityId)), JSON.stringify(record.settings)],
    )
  }

  async function poolRead<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    }
    catch (error) {
      if (error instanceof ProfileFailure) throw error
      throw new ProfileFailure('unavailable', 'database read failed')
    }
  }

  /** Records for many identities at once, keyed by identity. Missing ones are absent. */
  async function readRecords(identityIds: readonly string[]): Promise<Map<string, StoredRecord>> {
    const records = new Map<string, StoredRecord>()
    if (identityIds.length === 0) return records
    const { rows } = await poolRead(() => pool.query(
      `select r."identity_id", r."ciphertext", r."disclosure", r."version", k."key_version", k."wrapped_key"
       from ${s}."record" r join ${s}."subject_key" k using ("identity_id") where r."identity_id" = any ($1::text[])`,
      [identityIds],
    ) as Promise<{ rows: Record<string, unknown>[] }>)
    for (const row of rows) records.set(row.identity_id as string, await decodeRecord(row.identity_id as string, row))
    return records
  }

  async function describe(viewerId: string, subjectIds: string[], groupId: string | null): Promise<DisclosureContext> {
    let answer: unknown
    try {
      answer = await disclosure().describe({ viewerId, subjectIds, groupId }, { consistency: 'bounded' })
    }
    catch (error) {
      if (error instanceof ProfileFailure || (error as Error)?.name === 'ProfileCompositionError') throw error
      throw new ProfileFailure('unavailable', 'disclosure context failed')
    }
    const parsed = disclosureContextSchema.safeParse(answer)
    if (!parsed.success || parsed.data.viewerId !== viewerId) throw new ProfileFailure('unavailable', 'disclosure context is malformed')
    return parsed.data
  }

  async function departures(groupId: string, identityIds: readonly string[], records: Map<string, StoredRecord>): Promise<Map<string, DepartureFacts>> {
    const facts = new Map<string, DepartureFacts>()
    if (identityIds.length === 0) return facts
    const { rows } = await poolRead(() => pool.query(
      `select "identity_id", "name_ciphertext", "pseudonym", "anonymised" from ${s}."departure" where "group_id" = $1 and "identity_id" = any ($2::text[])`,
      [groupId, identityIds],
    ) as Promise<{ rows: Record<string, unknown>[] }>)
    for (const row of rows) {
      const identityId = row.identity_id as string
      let name: string | null = null
      const record = records.get(identityId)
      if (row.name_ciphertext && record) {
        try {
          name = open(record.key, row.name_ciphertext as Uint8Array, aad.departureName(identityId, groupId))
        }
        catch {
          throw new ProfileFailure('unavailable', 'stored departure is malformed')
        }
      }
      facts.set(identityId, { name, pseudonym: (row.pseudonym as number | null) ?? null, anonymised: row.anonymised === true })
    }
    return facts
  }

  async function lookup(input: { viewerId: unknown, subjectIds: unknown, groupId?: unknown, purpose: unknown }) {
    const viewerId = parse(() => identifierSchema.parse(input.viewerId))
    const subjectIds = parse(() => [...new Set(identifierSchema.array().min(1).max(DISCLOSURE_MAX_SUBJECTS).parse(input.subjectIds))])
    const groupId = parse(() => identifierSchema.nullable().parse(input.groupId ?? null))
    const purpose = parse(() => identifierPurpose(input.purpose))
    const context = await describe(viewerId, subjectIds, groupId)
    const facts = new Map(context.subjects.map(subject => [subject.subjectId, subject]))
    // Decrypt only the records the viewer may see something of.
    const needed = subjectIds.filter((id) => {
      const subject = facts.get(id)
      return subject && subject.relationship !== 'none' && (subject.relationship === 'self' || subject.standing === 'visible' || subject.standing === 'paused')
    })
    const records = await readRecords(needed)
    const formerMembers = context.groupId ? needed.filter(id => facts.get(id)?.relationship === 'former-member') : []
    const departed = context.groupId ? await departures(context.groupId, formerMembers, records) : new Map<string, DepartureFacts>()
    return subjectIds.map((subjectId) => {
      const subject = facts.get(subjectId)
      const record = records.get(subjectId) ?? null
      const disclosureInput = {
        relationship: subject?.relationship ?? 'none' as const,
        standing: subject?.standing ?? 'gone' as const,
        purpose,
        attributes: record?.attributes ?? null,
        settings: record?.settings ?? DEFAULT_DISCLOSURE_SETTINGS,
        departureAttribution: context.departurePolicy?.attribution ?? null,
        departure: departed.get(subjectId) ?? null,
      }
      return { subjectId, input: disclosureInput }
    })
  }

  function identifierPurpose(value: unknown): LookupPurpose {
    if (typeof value !== 'string' || !(LOOKUP_PURPOSES as readonly string[]).includes(value)) throw new ProfileFailure('validation-failed', 'invalid purpose')
    return value as LookupPurpose
  }

  async function erase(client: Client, identityId: string, reasonCode: string, correlationId: string): Promise<boolean> {
    await client.query(`delete from ${s}."departure" where "identity_id" = $1`, [identityId])
    await client.query(`delete from ${s}."subject_key" where "identity_id" = $1`, [identityId])
    const { rows } = await client.query(
      `insert into ${s}."erased" ("identity_id", "reason_code") values ($1, $2) on conflict do nothing returning 1`,
      [identityId, reasonCode],
    )
    if (rows.length === 0) return false
    await emit(client, event('profile.anonymised', { identityId, reasonCode }, correlationId))
    return true
  }

  async function snapshotDeparture(client: Client, identityId: string, groupId: string, endedAt: string): Promise<void> {
    if (await isErased(client, identityId)) return
    const record = await readRecord(client, identityId)
    const settings = record?.settings ?? DEFAULT_DISCLOSURE_SETTINGS
    if (settings.anonymiseOnDeparture) {
      await client.query(
        `insert into ${s}."departure" ("group_id", "identity_id", "ended_at", "anonymised") values ($1, $2, $3, true)
         on conflict ("group_id", "identity_id") do update set "ended_at" = excluded."ended_at", "name_ciphertext" = null, "pseudonym" = null, "anonymised" = true`,
        [groupId, identityId, endedAt],
      )
      return
    }
    // The name fellow members could see when the person left, if any.
    const visibleToMembers = record && settings.audiences[settings.displayName] !== 'nobody' ? chosenDisplayName(record.attributes, settings) : null
    const nameCiphertext = record && visibleToMembers !== null ? seal(record.key, visibleToMembers, aad.departureName(identityId, groupId)) : null
    const existing = await client.query(`select "pseudonym", "anonymised" from ${s}."departure" where "group_id" = $1 and "identity_id" = $2 for update`, [groupId, identityId])
    const previous = existing.rows[0]
    if (previous?.anonymised === true) {
      await client.query(`update ${s}."departure" set "ended_at" = $3 where "group_id" = $1 and "identity_id" = $2`, [groupId, identityId, endedAt])
      return
    }
    let pseudonym = (previous?.pseudonym as number | null | undefined) ?? null
    if (pseudonym === null) {
      const counter = await client.query(
        `insert into ${s}."pseudonym_counter" ("group_id", "last") values ($1, 1)
         on conflict ("group_id") do update set "last" = ${s}."pseudonym_counter"."last" + 1 returning "last"`,
        [groupId],
      )
      pseudonym = counter.rows[0]!.last as number
    }
    await client.query(
      `insert into ${s}."departure" ("group_id", "identity_id", "ended_at", "name_ciphertext", "pseudonym") values ($1, $2, $3, $4, $5)
       on conflict ("group_id", "identity_id") do update set "ended_at" = excluded."ended_at", "name_ciphertext" = excluded."name_ciphertext", "pseudonym" = excluded."pseudonym"`,
      [groupId, identityId, endedAt, nameCiphertext, pseudonym],
    )
  }

  return {
    /** The person's own record and settings. Defaults for someone with no record yet; null once erased. */
    async own(input: { subjectId: unknown }): Promise<OwnProfile | null> {
      const subjectId = parse(() => identifierSchema.parse(input.subjectId))
      const { rows } = await poolRead(() => pool.query(`select 1 from ${s}."erased" where "identity_id" = $1`, [subjectId]) as Promise<{ rows: unknown[] }>)
      if (rows.length > 0) return null
      const record = await poolRead(() => readRecord(pool, subjectId))
      return record ? { attributes: record.attributes, settings: record.settings, version: record.version } : { attributes: {}, settings: DEFAULT_DISCLOSURE_SETTINGS, version: 0 }
    },

    /** The person changes their own attributes: values set, `null` removes. Contact details are stored unverified. */
    async update(input: { subjectId: unknown, changes: unknown, correlationId: unknown, expectedVersion?: unknown }): Promise<OwnProfile> {
      const subjectId = parse(() => identifierSchema.parse(input.subjectId))
      const correlationId = parse(() => correlationIdSchema.parse(input.correlationId))
      const changes = parse(() => profileChangesSchema.parse(input.changes))
      const expected = expectedVersionOf(input.expectedVersion)
      return transaction(async (client) => {
        await checkVersion(client, subjectId, expected)
        if (await ensureRecord(client, subjectId, correlationId) === 'erased') throw new ProfileFailure('forbidden')
        const record = (await readRecord(client, subjectId, true))!
        const attributes: Record<string, unknown> = { ...record.attributes }
        const changed: ProfileAttribute[] = []
        for (const key of PROFILE_ATTRIBUTES) {
          if (!(key in changes)) continue
          const value = changes[key]
          const claim = VERIFICATION_CLAIMS[key]
          if (value === null || value === undefined) {
            delete attributes[key]
            if (claim) delete attributes[claim]
          }
          else {
            attributes[key] = value
            if (claim) attributes[claim] = false
          }
          changed.push(key)
        }
        record.attributes = attributes as ProfileAttributes
        await writeRecord(client, subjectId, record)
        await emit(client, event('profile.changed', { identityId: subjectId, attributes: changed, disclosure: false }, correlationId))
        return { attributes: record.attributes, settings: record.settings, version: record.version + 1 }
      })
    },

    /** The person sets who sees each attribute, which name others see, and their departure choice. */
    async setDisclosure(input: { subjectId: unknown, settings: unknown, correlationId: unknown, expectedVersion?: unknown }): Promise<OwnProfile> {
      const subjectId = parse(() => identifierSchema.parse(input.subjectId))
      const correlationId = parse(() => correlationIdSchema.parse(input.correlationId))
      const settings = parse(() => disclosureSettingsSchema.parse(input.settings))
      const expected = expectedVersionOf(input.expectedVersion)
      return transaction(async (client) => {
        await checkVersion(client, subjectId, expected)
        if (await ensureRecord(client, subjectId, correlationId) === 'erased') throw new ProfileFailure('forbidden')
        const record = (await readRecord(client, subjectId, true))!
        record.settings = settings
        await writeRecord(client, subjectId, record)
        await emit(client, event('profile.changed', { identityId: subjectId, attributes: [], disclosure: true }, correlationId))
        return { attributes: record.attributes, settings: record.settings, version: record.version + 1 }
      })
    },

    /**
     * The person chooses to be shown as "Former member" in a group, whatever
     * its policy: the name kept and the pseudonym are deleted.
     */
    async anonymiseDeparture(input: { subjectId: unknown, groupId: unknown, correlationId: unknown }): Promise<void> {
      const subjectId = parse(() => identifierSchema.parse(input.subjectId))
      const groupId = parse(() => identifierSchema.parse(input.groupId))
      const correlationId = parse(() => correlationIdSchema.parse(input.correlationId))
      await transaction(async (client) => {
        await client.query(
          `insert into ${s}."departure" ("group_id", "identity_id", "ended_at", "anonymised") values ($1, $2, $3, true)
           on conflict ("group_id", "identity_id") do update set "name_ciphertext" = null, "pseudonym" = null, "anonymised" = true`,
          [groupId, subjectId, now().toISOString()],
        )
        await emit(client, event('profile.departure-anonymised', { identityId: subjectId, groupId }, correlationId))
      })
    },

    /**
     * Counts one lookup by the viewer against `PROFILE_LOOKUP_RATE_LIMIT`.
     * Refuses with `rate-limited` once the window's allowance is spent.
     */
    async consumeLookup(input: { viewerId: unknown }): Promise<void> {
      const viewerId = parse(() => identifierSchema.parse(input.viewerId))
      const { requests, windowSeconds } = PROFILE_LOOKUP_RATE_LIMIT
      const at = now().getTime()
      const windowStart = new Date(at - (at % (windowSeconds * 1000))).toISOString()
      const count = await transaction(async (client) => {
        await client.query(`delete from ${s}."lookup_window" where "viewer_id" = $1 and "window_start" < $2`, [viewerId, windowStart])
        const { rows } = await client.query(
          `insert into ${s}."lookup_window" ("viewer_id", "window_start", "count") values ($1, $2, 1)
           on conflict ("viewer_id", "window_start") do update set "count" = ${s}."lookup_window"."count" + 1 returning "count"`,
          [viewerId, windowStart],
        )
        return rows[0]!.count as number
      })
      if (count > requests) throw new ProfileFailure('rate-limited')
    },

    /** Display names for up to 200 people, as the viewer may see them, in the order asked. */
    async displayNames(input: { viewerId: unknown, subjectIds: unknown, groupId?: unknown, purpose: unknown }): Promise<{ subjectId: string, displayName: DisplayName }[]> {
      const answers = await lookup(input)
      return answers.map(({ subjectId, input: disclosureInput }) => ({ subjectId, displayName: discloseDisplayName(disclosureInput) }))
    },

    /** One person's profile as the viewer may see it now. Never says whether a record exists. */
    async view(input: { viewerId: unknown, subjectId: unknown, groupId?: unknown }): Promise<{ subjectId: string, displayName: DisplayName, attributes: ProfileAttributes }> {
      const [answer] = await lookup({ viewerId: input.viewerId, subjectIds: [input.subjectId], groupId: input.groupId, purpose: 'listing' })
      return { subjectId: answer!.subjectId, displayName: discloseDisplayName(answer!.input), attributes: discloseAttributes(answer!.input) }
    },

    /** Profile's part of a data-subject export: the record, the settings and the departures, decrypted. */
    async exportData(input: { subjectId: unknown }): Promise<{ attributes: ProfileAttributes, settings: DisclosureSettings, departures: DepartureExport[] } | null> {
      const subjectId = parse(() => identifierSchema.parse(input.subjectId))
      const erased = await poolRead(() => pool.query(`select 1 from ${s}."erased" where "identity_id" = $1`, [subjectId]) as Promise<{ rows: unknown[] }>)
      if (erased.rows.length > 0) return null
      const record = await poolRead(() => readRecord(pool, subjectId))
      const { rows } = await poolRead(() => pool.query(
        `select "group_id", "ended_at", "name_ciphertext", "pseudonym", "anonymised" from ${s}."departure" where "identity_id" = $1 order by "ended_at", "group_id"`,
        [subjectId],
      ) as Promise<{ rows: Record<string, unknown>[] }>)
      return {
        attributes: record?.attributes ?? {},
        settings: record?.settings ?? DEFAULT_DISCLOSURE_SETTINGS,
        departures: rows.map(row => ({
          groupId: row.group_id as string,
          endedAt: new Date(row.ended_at as string).toISOString(),
          name: row.name_ciphertext && record ? openOrFail(record.key, row.name_ciphertext as Uint8Array, aad.departureName(subjectId, row.group_id as string)) : null,
          pseudonym: (row.pseudonym as number | null) ?? null,
          anonymised: row.anonymised === true,
        })),
      }
    },

    /**
     * Applies one Identity event (iam-integration architecture §4):
     * `identity.provisioned` creates the empty record and key for a person,
     * `membership.ended` keeps how the leaver is shown in the group, and
     * `identity.closed` erases the record. Idempotent by event id; other
     * types are ignored.
     */
    async applyIdentityEvent(identityEvent: IdentityEventLike): Promise<'applied' | 'duplicate' | 'ignored'> {
      const type = identityEvent?.type
      if (type !== 'identity.provisioned' && type !== 'membership.ended' && type !== 'identity.closed') return 'ignored'
      const eventId = parse(() => identifierSchema.parse(identityEvent.eventId))
      const correlationId = parse(() => correlationIdSchema.parse(identityEvent.correlationId))
      const data = identityEvent.data ?? {}
      const identityId = parse(() => identifierSchema.parse(data.identityId))
      return transaction(async (client) => {
        const fresh = await client.query(`insert into ${s}."processed_event" ("event_id") values ($1) on conflict do nothing returning 1`, [eventId])
        if (fresh.rows.length === 0) return 'duplicate'
        switch (type) {
          case 'identity.provisioned':
            // Profile describes people: service and break-glass identities have no record.
            if (data.kind === 'person') await ensureRecord(client, identityId, correlationId)
            break
          case 'membership.ended': {
            const groupId = parse(() => identifierSchema.parse(data.groupId))
            const endedAt = parse(() => new Date(identityEvent.occurredAt).toISOString())
            await snapshotDeparture(client, identityId, groupId, endedAt)
            break
          }
          case 'identity.closed':
            await erase(client, identityId, 'identity-closed', correlationId)
            break
        }
        return 'applied'
      })
    },

    /**
     * Erases a person's record: deletes it, their departures and their key,
     * and records the identity so no record is created for it again.
     * Announced as `profile.anonymised`. Returns false if already erased.
     */
    async erase(input: { identityId: unknown, reasonCode: unknown, correlationId: unknown }): Promise<boolean> {
      const identityId = parse(() => identifierSchema.parse(input.identityId))
      const reasonCode = parse(() => reasonCodeSchema.parse(input.reasonCode))
      const correlationId = parse(() => correlationIdSchema.parse(input.correlationId))
      return transaction(client => erase(client, identityId, reasonCode, correlationId))
    },

    /**
     * Maintenance: re-wraps up to `limit` keys still wrapped with an older
     * version under the current one. Returns how many were moved.
     */
    async rewrapKeys(input: { limit?: number } = {}): Promise<number> {
      const limit = Math.max(1, Math.min(Math.trunc(input.limit ?? 100), 1000))
      const current = keys.currentVersion()
      return transaction(async (client) => {
        const { rows } = await client.query(
          `select "identity_id", "key_version", "wrapped_key" from ${s}."subject_key" where "key_version" <> $1 order by "identity_id" limit $2 for update skip locked`,
          [current, limit],
        )
        for (const row of rows) {
          const identityId = row.identity_id as string
          const key = await unwrap(identityId, row.key_version as string, row.wrapped_key as string)
          let wrapped
          try {
            wrapped = await keys.wrap(key, { identityId })
          }
          catch {
            throw new ProfileFailure('unavailable', 'key wrapping failed')
          }
          await client.query(
            `update ${s}."subject_key" set "key_version" = $2, "wrapped_key" = $3, "rewrapped_at" = now() where "identity_id" = $1`,
            [identityId, wrapped.version, wrapped.wrapped],
          )
        }
        return rows.length
      })
    },

    /** How many live keys each wrapping-key version still protects, so the host knows when one can be retired. */
    async keyVersionsInUse(): Promise<{ version: string, keys: number }[]> {
      const { rows } = await poolRead(() => pool.query(
        `select "key_version", count(*)::int as "keys" from ${s}."subject_key" group by "key_version" order by "key_version"`,
      ) as Promise<{ rows: { key_version: string, keys: number }[] }>)
      return rows.map(row => ({ version: row.key_version, keys: row.keys }))
    },

    /**
     * Publishes up to `limit` outbox events in order. Stops at the first
     * failure, leaving it and the rest for the next run. Returns how many
     * were published.
     */
    async relayOutbox(input: { publish: ProfileEventPublisher, limit?: number }): Promise<number> {
      const limit = Math.max(1, Math.min(Math.trunc(input.limit ?? 100), 1000))
      return transaction(async (client) => {
        const { rows } = await client.query(
          `select "sequence", "event" from ${s}."outbox" where "published_at" is null order by "sequence" limit $1 for update skip locked`,
          [limit],
        )
        const published: unknown[] = []
        for (const row of rows) {
          try {
            await input.publish(row.event as ProfileEvent)
          }
          catch {
            break
          }
          published.push(row.sequence)
        }
        if (published.length > 0) {
          await client.query(`update ${s}."outbox" set "published_at" = now() where "sequence" = any ($1::bigint[])`, [published])
        }
        return published.length
      })
    },
  }
}

export type ProfileService = ReturnType<typeof createService>
