import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DisclosureContext, IdentityEventLike, ProfileDisclosureContextPort, ProfileEvent, ProfileKeyWrapper } from '../contracts'
import { DEFAULT_DISCLOSURE_SETTINGS, ProfileFailure } from '../contracts'
import { PROFILE_MIGRATIONS, runProfileMigrations } from '../server/database/migrations'
import { aad, open, uuidv7 } from '../server/internal/crypto'
import { createService } from '../server/internal/service'
import { createLocalProfileKeyWrapper } from '../server/utils/profile-keys'
import { createTestDatabase, hasDatabase, requireDatabaseInCi } from './support/database'

requireDatabaseInCi()

const master = (fill: number) => Buffer.alloc(32, fill).toString('base64')
const correlationId = () => uuidv7()

type Subject = DisclosureContext['subjects'][number]

describe.skipIf(!hasDatabase)('Profile storage on PostgreSQL', () => {
  let admin: pg.Pool
  let runtime: pg.Pool
  let drop: () => Promise<void>
  const role = `profile_runtime_${randomBytes(4).toString('hex')}`

  // A stand-in for Identity's disclosure-context port: relationships and standings set per test.
  const relationships = new Map<string, Omit<Subject, 'subjectId'>>()
  let departurePolicy: DisclosureContext['departurePolicy'] = null
  let failing: 'reject' | 'malformed' | null = null
  const disclosure: ProfileDisclosureContextPort = {
    async describe(request, options) {
      expect(options.consistency).toBe('bounded')
      if (failing === 'reject') throw new Error('identity down')
      if (failing === 'malformed') return { viewerId: request.viewerId, subjects: 'oops' } as never
      return {
        viewerId: request.viewerId,
        groupId: request.groupId,
        departurePolicy: request.groupId ? departurePolicy : null,
        subjects: request.subjectIds.map(subjectId => subjectId === request.viewerId
          ? { subjectId, relationship: 'self', standing: 'visible' }
          : { subjectId, ...(relationships.get(subjectId) ?? { relationship: 'none', standing: 'visible' }) }),
        readAt: new Date().toISOString(),
      }
    },
  }

  let keys: ProfileKeyWrapper = createLocalProfileKeyWrapper({ keys: { v1: master(1) }, current: 'v1' })
  const service = () => createService({ pool: runtime, schema: 'profile', keys, disclosure: () => disclosure })

  const ids = { viewer: uuidv7(), ada: uuidv7(), grace: uuidv7(), group: uuidv7(), other: uuidv7() }
  const identityEvent = (type: string, data: Record<string, unknown>): IdentityEventLike =>
    ({ eventId: uuidv7(), type, occurredAt: new Date().toISOString(), correlationId: correlationId(), data })
  const provision = (identityId: string, kind = 'person') =>
    service().applyIdentityEvent(identityEvent('identity.provisioned', { identityId, kind, homeTenantId: uuidv7(), personalGroupId: uuidv7() }))
  const outbox = async () => (await admin.query('select "event" from "profile"."outbox" order by "sequence"')).rows.map(row => row.event as ProfileEvent)
  const names = (subjectIds: string[], extra: { groupId?: string, purpose?: 'attribution' | 'listing' } = {}) =>
    service().displayNames({ viewerId: ids.viewer, subjectIds, groupId: extra.groupId ?? null, purpose: extra.purpose ?? 'listing' })

  beforeAll(async () => {
    const database = await createTestDatabase()
    drop = database.drop
    admin = new pg.Pool({ connectionString: database.url })
    await admin.query(`create role "${role}" login password 'runtime'`)
    const url = new URL(database.url)
    url.username = role
    url.password = 'runtime'
    runtime = new pg.Pool({ connectionString: url.toString() })
  })

  beforeEach(() => {
    relationships.clear()
    departurePolicy = null
    failing = null
  })

  afterAll(async () => {
    await runtime?.end()
    await admin?.query(`drop owned by "${role}"`).catch(() => {})
    await admin?.end()
    await drop?.()
    const cleanup = new pg.Client({ connectionString: process.env.PROFILE_TEST_DATABASE_URL })
    await cleanup.connect()
    await cleanup.query(`drop role if exists "${role}"`).catch(() => {})
    await cleanup.end()
  })

  it('applies every migration once, even when instances race, and grants the runtime role only data access', async () => {
    const results = await Promise.all([runProfileMigrations(admin, 'profile', role), runProfileMigrations(admin, 'profile', role)])
    expect(results.flat()).toEqual(PROFILE_MIGRATIONS.map(m => m.id))
    expect(await runProfileMigrations(admin, 'profile', role)).toEqual([])
    const owned = await admin.query(`select count(*)::int as n from pg_tables where schemaname = 'profile' and tableowner = $1`, [role])
    expect(owned.rows[0].n).toBe(0)
    await expect(runtime.query('create table "profile"."intruder" (x int)')).rejects.toThrow()
    await expect(runtime.query(`delete from "profile"."erased"`)).rejects.toThrow()
    const bypass = await admin.query('select rolbypassrls, rolsuper from pg_roles where rolname = $1', [role])
    expect(bypass.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false })
  })

  it('creates an empty record for each new person, once, and none for other kinds of identity', async () => {
    expect(await provision(ids.ada)).toBe('applied')
    const event = identityEvent('identity.provisioned', { identityId: ids.grace, kind: 'person' })
    expect(await service().applyIdentityEvent(event)).toBe('applied')
    expect(await service().applyIdentityEvent(event)).toBe('duplicate')
    const robot = uuidv7()
    expect(await provision(robot, 'service')).toBe('applied')
    expect(await service().own({ subjectId: ids.ada })).toEqual({ attributes: {}, settings: DEFAULT_DISCLOSURE_SETTINGS, version: 1 })
    const records = await admin.query('select "identity_id" from "profile"."record"')
    expect(records.rows.map(row => row.identity_id).sort()).toEqual([ids.ada, ids.grace].sort())
    expect((await outbox()).filter(e => e.type === 'profile.created').map(e => e.data.identityId).sort()).toEqual([ids.ada, ids.grace].sort())
    expect(await service().applyIdentityEvent(identityEvent('group.created', { groupId: ids.group }))).toBe('ignored')
  })

  it('keeps every value encrypted with the person\'s own key, and contact details unverified', async () => {
    const updated = await service().update({
      subjectId: ids.ada,
      correlationId: correlationId(),
      changes: { name: ' Ada  Lovelace ', given_name: 'Ada', email: 'ada@example.com', locale: 'en-GB' },
    })
    expect(updated.attributes).toEqual({ name: 'Ada Lovelace', given_name: 'Ada', email: 'ada@example.com', email_verified: false, locale: 'en-GB' })
    const dump = JSON.stringify((await admin.query(`select * from "profile"."record"`)).rows) + JSON.stringify(await outbox())
    for (const value of ['Lovelace', 'ada@example.com', 'en-GB']) expect(dump).not.toContain(value)
    const bytes = (await admin.query(`select "ciphertext" from "profile"."record" where "identity_id" = $1`, [ids.ada])).rows[0].ciphertext as Buffer
    expect(bytes.includes(Buffer.from('Lovelace'))).toBe(false)
    expect((await outbox()).at(-1)).toMatchObject({ type: 'profile.changed', data: { identityId: ids.ada, attributes: ['name', 'given_name', 'locale', 'email'], disclosure: false } })

    const removed = await service().update({ subjectId: ids.ada, correlationId: correlationId(), changes: { email: null, locale: null } })
    expect(removed.attributes).toEqual({ name: 'Ada Lovelace', given_name: 'Ada' })
    await expect(service().update({ subjectId: ids.ada, correlationId: correlationId(), changes: { name: 'Аda' } })).rejects.toMatchObject({ code: 'validation-failed' })
  })

  it('creates the record on first use when the provisioning event has not arrived yet', async () => {
    const early = uuidv7()
    await service().update({ subjectId: early, correlationId: correlationId(), changes: { name: 'Early Bird' } })
    expect(await provision(early)).toBe('applied')
    expect((await service().own({ subjectId: early }))?.attributes).toEqual({ name: 'Early Bird' })
  })

  it('discloses each attribute only to the audience the person chose', async () => {
    await service().update({ subjectId: ids.ada, correlationId: correlationId(), changes: { email: 'ada@example.com', preferred_username: 'countess' } })
    await service().setDisclosure({
      subjectId: ids.ada,
      correlationId: correlationId(),
      settings: { ...DEFAULT_DISCLOSURE_SETTINGS, audiences: { ...DEFAULT_DISCLOSURE_SETTINGS.audiences, email: 'tenant' } },
    })
    relationships.set(ids.ada, { relationship: 'same-group', standing: 'visible' })
    expect(await service().view({ viewerId: ids.viewer, subjectId: ids.ada })).toEqual({
      subjectId: ids.ada,
      displayName: { kind: 'name', value: 'Ada Lovelace' },
      attributes: { name: 'Ada Lovelace', email: 'ada@example.com', email_verified: false },
    })
    relationships.set(ids.ada, { relationship: 'same-tenant', standing: 'visible' })
    expect(await service().view({ viewerId: ids.viewer, subjectId: ids.ada })).toEqual({
      subjectId: ids.ada,
      displayName: { kind: 'hidden' },
      attributes: { email: 'ada@example.com', email_verified: false },
    })
    relationships.set(ids.ada, { relationship: 'none', standing: 'visible' })
    expect(await service().view({ viewerId: ids.viewer, subjectId: ids.ada })).toEqual({ subjectId: ids.ada, displayName: { kind: 'hidden' }, attributes: {} })
  })

  it('shows the name the person picked, in the order asked, and the same answer whether or not a record exists', async () => {
    await service().setDisclosure({
      subjectId: ids.grace,
      correlationId: correlationId(),
      settings: { ...DEFAULT_DISCLOSURE_SETTINGS, displayName: 'preferred_username', audiences: { ...DEFAULT_DISCLOSURE_SETTINGS.audiences, preferred_username: 'group' } },
    })
    await service().update({ subjectId: ids.grace, correlationId: correlationId(), changes: { name: 'Grace Hopper', preferred_username: 'amazing-grace' } })
    relationships.set(ids.ada, { relationship: 'same-group', standing: 'visible' })
    relationships.set(ids.grace, { relationship: 'same-group', standing: 'visible' })
    const stranger = uuidv7()
    relationships.set(stranger, { relationship: 'same-group', standing: 'visible' })
    expect(await names([ids.grace, stranger, ids.ada, ids.grace])).toEqual([
      { subjectId: ids.grace, displayName: { kind: 'name', value: 'amazing-grace' } },
      { subjectId: stranger, displayName: { kind: 'hidden' } },
      { subjectId: ids.ada, displayName: { kind: 'name', value: 'Ada Lovelace' } },
    ])
  })

  it('keeps a paused person attributed but out of listings, and hides a suspended one', async () => {
    relationships.set(ids.ada, { relationship: 'same-group', standing: 'paused' })
    expect(await names([ids.ada], { purpose: 'attribution' })).toEqual([{ subjectId: ids.ada, displayName: { kind: 'name', value: 'Ada Lovelace' } }])
    expect(await names([ids.ada], { purpose: 'listing' })).toEqual([{ subjectId: ids.ada, displayName: { kind: 'hidden' } }])
    relationships.set(ids.ada, { relationship: 'same-group', standing: 'suspended' })
    expect(await names([ids.ada], { purpose: 'attribution' })).toEqual([{ subjectId: ids.ada, displayName: { kind: 'hidden' } }])
  })

  it('fails closed when Identity\'s port fails or answers malformed, and refuses bad input', async () => {
    failing = 'reject'
    await expect(names([ids.ada])).rejects.toMatchObject({ code: 'unavailable' })
    failing = 'malformed'
    await expect(names([ids.ada])).rejects.toMatchObject({ code: 'unavailable' })
    failing = null
    await expect(service().displayNames({ viewerId: ids.viewer, subjectIds: [], purpose: 'listing' })).rejects.toBeInstanceOf(ProfileFailure)
    await expect(service().displayNames({ viewerId: ids.viewer, subjectIds: Array.from({ length: 201 }, () => uuidv7()), purpose: 'listing' })).rejects.toMatchObject({ code: 'validation-failed' })
    await expect(service().displayNames({ viewerId: 'ada@example.com', subjectIds: [ids.ada], purpose: 'listing' })).rejects.toMatchObject({ code: 'validation-failed' })
  })

  it('applies the departure data policy with the name kept when the person left', async () => {
    await service().applyIdentityEvent(identityEvent('membership.ended', { membershipId: uuidv7(), identityId: ids.ada, groupId: ids.group, endReason: 'left', reasonCode: null }))
    await service().applyIdentityEvent(identityEvent('membership.ended', { membershipId: uuidv7(), identityId: ids.grace, groupId: ids.group, endReason: 'left', reasonCode: null }))
    // A later change of name does not change how the leaver is attributed.
    await service().update({ subjectId: ids.ada, correlationId: correlationId(), changes: { name: 'Augusta Ada King' } })
    relationships.set(ids.ada, { relationship: 'former-member', standing: 'visible' })
    relationships.set(ids.grace, { relationship: 'former-member', standing: 'visible' })
    const ask = () => names([ids.ada, ids.grace], { groupId: ids.group, purpose: 'attribution' })

    departurePolicy = { attribution: 'keep-name' }
    expect(await ask()).toEqual([
      { subjectId: ids.ada, displayName: { kind: 'name', value: 'Ada Lovelace' } },
      { subjectId: ids.grace, displayName: { kind: 'name', value: 'amazing-grace' } },
    ])
    departurePolicy = { attribution: 'pseudonymise' }
    expect(await ask()).toEqual([
      { subjectId: ids.ada, displayName: { kind: 'pseudonym', number: 1 } },
      { subjectId: ids.grace, displayName: { kind: 'pseudonym', number: 2 } },
    ])
    departurePolicy = { attribution: 'anonymise' }
    expect((await ask()).map(answer => answer.displayName)).toEqual([{ kind: 'former-member' }, { kind: 'former-member' }])

    // The leaver may always choose anonymity: the kept name and the pseudonym go.
    departurePolicy = { attribution: 'keep-name' }
    await service().anonymiseDeparture({ subjectId: ids.ada, groupId: ids.group, correlationId: correlationId() })
    expect((await ask())[0]!.displayName).toEqual({ kind: 'former-member' })
    const row = (await admin.query('select * from "profile"."departure" where "identity_id" = $1', [ids.ada])).rows[0]
    expect(row).toMatchObject({ name_ciphertext: null, pseudonym: null, anonymised: true })
    expect((await outbox()).at(-1)).toMatchObject({ type: 'profile.departure-anonymised', data: { identityId: ids.ada, groupId: ids.group } })
  })

  it('anonymises every departure for someone who chose it in advance', async () => {
    await service().setDisclosure({ subjectId: ids.grace, correlationId: correlationId(), settings: { ...DEFAULT_DISCLOSURE_SETTINGS, anonymiseOnDeparture: true } })
    await service().applyIdentityEvent(identityEvent('membership.ended', { membershipId: uuidv7(), identityId: ids.grace, groupId: ids.other, endReason: 'left', reasonCode: null }))
    relationships.set(ids.grace, { relationship: 'former-member', standing: 'visible' })
    departurePolicy = { attribution: 'keep-name' }
    expect(await names([ids.grace], { groupId: ids.other, purpose: 'attribution' })).toEqual([{ subjectId: ids.grace, displayName: { kind: 'former-member' } }])
  })

  it('exports the person\'s own data, decrypted', async () => {
    const exported = await service().exportData({ subjectId: ids.grace })
    expect(exported?.attributes).toEqual({ name: 'Grace Hopper', preferred_username: 'amazing-grace' })
    expect(exported?.departures.map(d => [d.groupId, d.name, d.anonymised])).toEqual(expect.arrayContaining([[ids.group, 'amazing-grace', false], [ids.other, null, true]]))
  })

  it('rotates the wrapping key: live keys move to the new version, and an erased person\'s backed-up data dies with the old one', async () => {
    // A "backup" taken under v1.
    const backup = (await admin.query(`select k."identity_id", k."key_version", k."wrapped_key", r."ciphertext" from "profile"."subject_key" k join "profile"."record" r using ("identity_id") where k."identity_id" = $1`, [ids.ada])).rows[0]
    expect(backup.key_version).toBe('v1')

    // Ada's account is closed: her record, departures and key are erased, and never recreated.
    expect(await service().applyIdentityEvent(identityEvent('identity.closed', { identityId: ids.ada, personalGroupId: uuidv7() }))).toBe('applied')
    expect((await outbox()).at(-1)).toMatchObject({ type: 'profile.anonymised', data: { identityId: ids.ada, reasonCode: 'identity-closed' } })
    for (const table of ['subject_key', 'record', 'departure']) {
      expect((await admin.query(`select 1 from "profile"."${table}" where "identity_id" = $1`, [ids.ada])).rows).toEqual([])
    }
    expect(await service().own({ subjectId: ids.ada })).toBeNull()
    expect(await service().exportData({ subjectId: ids.ada })).toBeNull()
    await expect(service().update({ subjectId: ids.ada, correlationId: correlationId(), changes: { name: 'Back Again' } })).rejects.toMatchObject({ code: 'forbidden' })
    await provision(ids.ada)
    expect((await admin.query('select 1 from "profile"."record" where "identity_id" = $1', [ids.ada])).rows).toEqual([])
    relationships.set(ids.ada, { relationship: 'same-group', standing: 'visible' })
    expect(await names([ids.ada])).toEqual([{ subjectId: ids.ada, displayName: { kind: 'hidden' } }])
    expect(await service().erase({ identityId: ids.ada, reasonCode: 'person-request', correlationId: correlationId() })).toBe(false)

    // The host rotates to v2: every live key moves; none is left on v1.
    keys = createLocalProfileKeyWrapper({ keys: { v1: master(1), v2: master(2) }, current: 'v2' })
    const before = await service().keyVersionsInUse()
    expect(before.find(v => v.version === 'v1')?.keys).toBeGreaterThan(0)
    let moved = 0
    for (let batch = await service().rewrapKeys({ limit: 1 }); batch > 0; batch = await service().rewrapKeys({ limit: 1 })) moved += batch
    expect(moved).toBe(before.find(v => v.version === 'v1')!.keys)
    expect((await service().keyVersionsInUse()).map(v => v.version)).toEqual(['v2'])

    // v1 is retired: the backup copy of Ada's key cannot be unwrapped, so her backed-up record is unreadable.
    keys = createLocalProfileKeyWrapper({ keys: { v2: master(2) }, current: 'v2' })
    await expect(keys.unwrap({ version: backup.key_version, wrapped: backup.wrapped_key }, { identityId: ids.ada })).rejects.toThrow()
    // Live records still read under v2.
    expect((await service().own({ subjectId: ids.grace }))?.attributes.name).toBe('Grace Hopper')
    // While v1 was still held, the backup would have opened: the test's backup is genuine.
    const old = createLocalProfileKeyWrapper({ keys: { v1: master(1) }, current: 'v1' })
    const key = await old.unwrap({ version: 'v1', wrapped: backup.wrapped_key }, { identityId: ids.ada })
    expect(open(key, backup.ciphertext, aad.record(ids.ada))).toContain('Augusta')
  })

  it('fails closed when the key port fails', async () => {
    const saved = keys
    keys = { currentVersion: () => 'v2', wrap: async () => { throw new Error('kms down') }, unwrap: async () => { throw new Error('kms down') } }
    try {
      await expect(service().own({ subjectId: ids.grace })).rejects.toMatchObject({ code: 'unavailable' })
      await expect(service().update({ subjectId: uuidv7(), correlationId: correlationId(), changes: { name: 'New Person' } })).rejects.toMatchObject({ code: 'unavailable' })
    }
    finally {
      keys = saved
    }
  })

  it('relays the outbox in order, stopping at the first failure and resuming from it', async () => {
    const pending = (await admin.query('select count(*)::int as n from "profile"."outbox" where "published_at" is null')).rows[0].n as number
    const seen: string[] = []
    let calls = 0
    const relayed = await service().relayOutbox({ limit: 1000, publish: async (event) => {
      calls += 1
      if (calls === 3) throw new Error('broker down')
      seen.push(event.eventId)
    } })
    expect(relayed).toBe(2)
    const rest = await service().relayOutbox({ limit: 1000, publish: async (event) => { seen.push(event.eventId) } })
    expect(relayed + rest).toBe(pending)
    const all = (await outbox()).map(e => e.eventId)
    expect(seen).toEqual(all)
  })
})
