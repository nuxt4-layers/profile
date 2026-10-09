import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import type { EventHandler, H3Event } from 'h3'
import { createApp, createRouter, defineEventHandler, getRequestHeader, toWebHandler } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DisclosureContext, ProfileDisclosureContextPort } from '../contracts'
import { DEFAULT_DISCLOSURE_SETTINGS, PROFILE_LOOKUP_RATE_LIMIT } from '../contracts'
import { runProfileMigrations } from '../server/database/migrations'
import { uuidv7 } from '../server/internal/crypto'
import { originRejected } from '../server/internal/http'
import {
  clearProfileComposition,
  provideProfileDatabase,
  provideProfileDisclosureContext,
  provideProfileKeyWrapper,
  provideProfileSubjectResolver,
} from '../server/utils/profile-composition'
import { applyProfileIdentityEvent } from '../server/utils/profile-server'
import { createLocalProfileKeyWrapper } from '../server/utils/profile-keys'
import { createTestDatabase, hasDatabase, requireDatabaseInCi } from './support/database'

requireDatabaseInCi()

const API = fileURLToPath(new URL('../server/api/profile', import.meta.url))

/** Every endpoint file, routed as Nuxt routes it: `[param]` → `:param`, method from the suffix. */
function endpointFiles(directory: string = API): { file: string, method: string, route: string }[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return endpointFiles(path)
    const match = /^(.*)\.(get|post|put|patch|delete)\.ts$/.exec(relative(API, path))
    if (!match) throw new Error(`Unexpected file in server/api/profile: ${entry.name}`)
    const route = `/api/profile/${match[1]!}`.replace(/\[(\w+)\]/g, ':$1').replace(/\/index$/, '')
    return [{ file: path, method: match[2]!, route }]
  })
}

describe.skipIf(!hasDatabase)('the /api/profile endpoints', () => {
  let pool: pg.Pool
  let drop: () => Promise<void>
  let handler: (request: Request) => Promise<Response>
  let resolverFails = false
  const relationships = new Map<string, DisclosureContext['subjects'][number]['relationship']>()

  const disclosure: ProfileDisclosureContextPort = {
    async describe(request) {
      return {
        viewerId: request.viewerId,
        groupId: request.groupId,
        departurePolicy: null,
        subjects: request.subjectIds.map(subjectId => ({
          subjectId,
          relationship: subjectId === request.viewerId ? 'self' : relationships.get(subjectId) ?? 'none',
          standing: 'visible',
        })),
        readAt: new Date().toISOString(),
      }
    },
  }

  async function call(method: string, path: string, options: { as?: string, body?: unknown, ageSeconds?: number } = {}) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (options.as) headers['x-test-principal'] = `${options.as}|${options.ageSeconds ?? 60}`
    const response = await handler(new Request(`http://profile.test${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }))
    const text = await response.text()
    const json = text ? JSON.parse(text) : null
    return { status: response.status, data: json?.data ?? json, headers: response.headers }
  }

  async function person(): Promise<string> {
    const identityId = uuidv7()
    await applyProfileIdentityEvent({ eventId: uuidv7(), type: 'identity.provisioned', occurredAt: new Date().toISOString(), correlationId: uuidv7(), data: { identityId, kind: 'person' } })
    return identityId
  }

  beforeAll(async () => {
    const database = await createTestDatabase()
    drop = database.drop
    pool = new pg.Pool({ connectionString: database.url })
    await runProfileMigrations(pool, 'profile')
    const app = createApp()
    const router = createRouter()
    for (const endpoint of endpointFiles()) {
      const module = await import(endpoint.file) as { default: EventHandler }
      router[endpoint.method as 'get' | 'post' | 'put' | 'patch' | 'delete'](endpoint.route, module.default)
    }
    app.use(router)
    app.use(defineEventHandler(() => { throw new Error('no such route') }))
    handler = toWebHandler(app)
  })

  beforeEach(() => {
    clearProfileComposition()
    resolverFails = false
    relationships.clear()
    provideProfileDatabase({ dialect: 'postgres', pool })
    provideProfileKeyWrapper(createLocalProfileKeyWrapper({ keys: { v1: Buffer.alloc(32, 3).toString('base64') }, current: 'v1' }))
    provideProfileDisclosureContext(disclosure)
    provideProfileSubjectResolver({
      async resolve(event) {
        if (resolverFails) throw new Error('authentication is down')
        const header = getRequestHeader(event as H3Event, 'x-test-principal')
        if (!header) return null
        const [principalId, age] = header.split('|')
        return { principalId: principalId!, authenticatedAt: new Date(Date.now() - Number(age) * 1000).toISOString(), assurance: { level: 'aal2', phishingResistant: true } }
      },
    })
  })

  afterAll(async () => {
    clearProfileComposition()
    await pool?.end()
    await drop?.()
  })

  it('mounts every endpoint file under the route Nuxt would give it, and offers no erasure', () => {
    const routes = endpointFiles().map(endpoint => `${endpoint.method.toUpperCase()} ${endpoint.route}`).sort()
    expect(routes).toEqual([
      'GET /api/profile/me',
      'GET /api/profile/me/export',
      'GET /api/profile/people/:subjectId',
      'PATCH /api/profile/me',
      'POST /api/profile/display-names',
      'POST /api/profile/me/departures/:groupId/anonymise',
      'PUT /api/profile/me/disclosure',
    ])
  })

  it('answers unauthenticated without a subject, and unavailable when the resolver or a port fails', async () => {
    expect(await call('GET', '/api/profile/me')).toMatchObject({ status: 401, data: { code: 'unauthenticated', messageKey: 'profile.error.unauthenticated' } })
    const me = uuidv7()
    resolverFails = true
    expect(await call('GET', '/api/profile/me', { as: me })).toMatchObject({ status: 503, data: { code: 'unavailable' } })
    resolverFails = false
    clearProfileComposition()
    provideProfileSubjectResolver({ resolve: async () => ({ principalId: me, authenticatedAt: new Date().toISOString(), assurance: { level: 'aal1', phishingResistant: false } }) })
    expect(await call('GET', '/api/profile/me', { as: me })).toMatchObject({ status: 503, data: { code: 'unavailable' } })
  })

  it('lets the person read and change their own profile, refusing a stale version', async () => {
    const me = await person()
    const first = await call('GET', '/api/profile/me', { as: me })
    expect(first).toMatchObject({ status: 200, data: { attributes: {}, settings: DEFAULT_DISCLOSURE_SETTINGS, version: 1 } })

    const changed = await call('PATCH', '/api/profile/me', { as: me, body: { expectedVersion: 1, changes: { name: 'Ada Lovelace', locale: 'en-GB' } } })
    expect(changed).toMatchObject({ status: 200, data: { attributes: { name: 'Ada Lovelace', locale: 'en-GB' }, version: 2 } })

    // Another tab still holds version 1.
    const stale = await call('PATCH', '/api/profile/me', { as: me, body: { expectedVersion: 1, changes: { name: 'Someone Else' } } })
    expect(stale).toMatchObject({ status: 409, data: { code: 'conflict', reason: 'version-changed' } })
    expect((await call('GET', '/api/profile/me', { as: me })).data.attributes.name).toBe('Ada Lovelace')

    const settings = { ...DEFAULT_DISCLOSURE_SETTINGS, audiences: { ...DEFAULT_DISCLOSURE_SETTINGS.audiences, locale: 'group' } }
    expect(await call('PUT', '/api/profile/me/disclosure', { as: me, body: { expectedVersion: 2, settings } })).toMatchObject({ status: 200, data: { version: 3, settings } })
    expect(await call('PUT', '/api/profile/me/disclosure', { as: me, body: { expectedVersion: 2, settings } })).toMatchObject({ status: 409 })
  })

  it('needs a recent sign-in to change a contact detail, but not a name', async () => {
    const me = await person()
    const old = 20 * 60
    expect(await call('PATCH', '/api/profile/me', { as: me, ageSeconds: old, body: { expectedVersion: 1, changes: { email: 'ada@example.com' } } }))
      .toMatchObject({ status: 403, data: { code: 'insufficient-assurance', messageKey: 'profile.error.insufficient-assurance' } })
    expect(await call('PATCH', '/api/profile/me', { as: me, ageSeconds: old, body: { expectedVersion: 1, changes: { phone_number: null } } }))
      .toMatchObject({ status: 403, data: { code: 'insufficient-assurance' } })
    expect(await call('PATCH', '/api/profile/me', { as: me, ageSeconds: old, body: { expectedVersion: 1, changes: { name: 'Ada' } } })).toMatchObject({ status: 200 })
    expect(await call('PATCH', '/api/profile/me', { as: me, body: { expectedVersion: 2, changes: { email: 'ada@example.com' } } }))
      .toMatchObject({ status: 200, data: { attributes: { email: 'ada@example.com', email_verified: false } } })
  })

  it('needs a recent sign-in to export, and never lets the export be cached', async () => {
    const me = await person()
    await call('PATCH', '/api/profile/me', { as: me, body: { expectedVersion: 1, changes: { name: 'Ada Lovelace' } } })
    expect(await call('GET', '/api/profile/me/export', { as: me, ageSeconds: 20 * 60 })).toMatchObject({ status: 403, data: { code: 'insufficient-assurance' } })
    const exported = await call('GET', '/api/profile/me/export', { as: me })
    expect(exported).toMatchObject({ status: 200, data: { attributes: { name: 'Ada Lovelace' }, departures: [] } })
    expect(exported.headers.get('cache-control')).toBe('no-store')
  })

  it('validates bodies strictly, answering problem codes only, never values', async () => {
    const me = await person()
    const bad = await call('PATCH', '/api/profile/me', { as: me, body: { expectedVersion: 1, changes: { email: 'not an address' } } })
    expect(bad).toMatchObject({ status: 400, data: { code: 'validation-failed', reason: 'invalid-email' } })
    expect(JSON.stringify(bad.data)).not.toContain('not an address')
    expect(await call('PATCH', '/api/profile/me', { as: me, body: { changes: { name: 'Ada' } } })).toMatchObject({ status: 400 })
    expect(await call('PATCH', '/api/profile/me', { as: me, body: { expectedVersion: 1, changes: { name: 'Ada' }, subjectId: uuidv7() } })).toMatchObject({ status: 400 })
    expect(await call('POST', '/api/profile/me/departures/not-a-group/anonymise', { as: me })).toMatchObject({ status: 400 })
  })

  it('takes the person only from the signed-in subject: no endpoint acts on someone else', async () => {
    const ada = await person()
    const mallory = await person()
    await call('PATCH', '/api/profile/me', { as: ada, body: { expectedVersion: 1, changes: { name: 'Ada Lovelace', email: 'ada@example.com' } } })
    expect((await call('GET', '/api/profile/me', { as: mallory })).data.attributes).toEqual({})
  })

  it('shows other people only as disclosure allows, the same for unknown people', async () => {
    const viewer = await person()
    const ada = await person()
    await call('PATCH', '/api/profile/me', { as: ada, body: { expectedVersion: 1, changes: { name: 'Ada Lovelace', email: 'ada@example.com' } } })
    relationships.set(ada, 'same-group')
    expect(await call('GET', `/api/profile/people/${ada}`, { as: viewer })).toMatchObject({
      status: 200,
      data: { subjectId: ada, displayName: { kind: 'name', value: 'Ada Lovelace' }, attributes: { name: 'Ada Lovelace' } },
    })
    const names = await call('POST', '/api/profile/display-names', { as: viewer, body: { subjectIds: [ada], purpose: 'attribution' } })
    expect(names).toMatchObject({ status: 200, data: [{ subjectId: ada, displayName: { kind: 'name', value: 'Ada Lovelace' } }] })

    relationships.set(ada, 'none')
    const stranger = uuidv7()
    const hidden = await call('GET', `/api/profile/people/${ada}`, { as: viewer })
    const unknown = await call('GET', `/api/profile/people/${stranger}`, { as: viewer })
    expect(hidden.data).toEqual({ subjectId: ada, displayName: { kind: 'hidden' }, attributes: {} })
    expect(unknown.data).toEqual({ subjectId: stranger, displayName: { kind: 'hidden' }, attributes: {} })
  })

  it('anonymises the person\'s own departure from a group', async () => {
    const me = await person()
    const groupId = uuidv7()
    expect(await call('POST', `/api/profile/me/departures/${groupId}/anonymise`, { as: me })).toEqual(expect.objectContaining({ status: 200, data: { groupId, status: 'anonymised' } }))
  })

  it('limits each viewer\'s lookups per window, and no one else\'s', async () => {
    const viewer = await person()
    const other = await person()
    const body = { subjectIds: [uuidv7()], purpose: 'listing' }
    for (let i = 0; i < PROFILE_LOOKUP_RATE_LIMIT.requests; i += 1) {
      const answer = await call('POST', '/api/profile/display-names', { as: viewer, body })
      if (answer.status !== 200) throw new Error(`lookup ${i} answered ${answer.status}`)
    }
    expect(await call('POST', '/api/profile/display-names', { as: viewer, body })).toMatchObject({ status: 429, data: { code: 'rate-limited' } })
    expect(await call('GET', `/api/profile/people/${other}`, { as: viewer })).toMatchObject({ status: 429 })
    expect(await call('POST', '/api/profile/display-names', { as: other, body })).toMatchObject({ status: 200 })
  })

  it('refuses state-changing requests from another origin, or with none configured', () => {
    const event = (method: string, path: string, origin?: string) => ({
      method,
      path,
      node: { req: { url: path, method, headers: { host: 'profile.test', ...(origin ? { origin } : {}) } } },
    }) as unknown as H3Event
    expect(originRejected(event('PATCH', '/api/profile/me', 'https://evil.test'), 'https://profile.test')).toBe(true)
    expect(originRejected(event('PATCH', '/api/profile/me', 'https://profile.test'), 'https://profile.test')).toBe(false)
    expect(originRejected(event('PATCH', '/api/profile/me'), 'https://profile.test')).toBe(true)
    expect(originRejected(event('PATCH', '/api/profile/me', 'https://profile.test'), '')).toBe(true)
    expect(originRejected(event('GET', '/api/profile/me'), '')).toBe(false)
    expect(originRejected(event('POST', '/api/elsewhere', 'https://evil.test'), 'https://profile.test')).toBe(false)
  })
})
