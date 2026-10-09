import { describe, expect, it } from 'vitest'
import { aad, newDataKey, open, seal, uuidv7 } from '../server/internal/crypto'
import { createLocalProfileKeyWrapper } from '../server/utils/profile-keys'

const master = (fill: number) => Buffer.alloc(32, fill).toString('base64')
const alice = '01928c4e-0000-7000-8000-000000000001'
const bob = '01928c4e-0000-7000-8000-000000000002'

describe('sealing attribute values', () => {
  it('round-trips, and refuses another identity\'s or purpose\'s context, or any alteration', () => {
    const key = newDataKey()
    const sealed = seal(key, 'Ada Lovelace', aad.record(alice))
    expect(sealed.includes(Buffer.from('Ada'))).toBe(false)
    expect(open(key, sealed, aad.record(alice))).toBe('Ada Lovelace')
    expect(() => open(key, sealed, aad.record(bob))).toThrow()
    expect(() => open(key, sealed, aad.departureName(alice, bob))).toThrow()
    const altered = Buffer.from(sealed)
    altered[altered.length - 1]! ^= 1
    expect(() => open(key, altered, aad.record(alice))).toThrow()
    expect(() => open(newDataKey(), sealed, aad.record(alice))).toThrow()
  })

  it('uses a fresh nonce each time', () => {
    const key = newDataKey()
    expect(seal(key, 'x', 'a').equals(seal(key, 'x', 'a'))).toBe(false)
  })

  it('issues UUIDv7 identifiers', () => {
    expect(uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('local key wrapper', () => {
  it('wraps with the current version, binds the identity, and unwraps older versions while they are kept', async () => {
    const v1 = createLocalProfileKeyWrapper({ keys: { v1: master(1) }, current: 'v1' })
    const key = newDataKey()
    const wrapped = await v1.wrap(key, { identityId: alice })
    expect(wrapped.version).toBe('v1')
    expect(Buffer.from(await v1.unwrap(wrapped, { identityId: alice })).equals(key)).toBe(true)
    await expect(v1.unwrap(wrapped, { identityId: bob })).rejects.toThrow()

    const rotated = createLocalProfileKeyWrapper({ keys: { v1: master(1), v2: master(2) }, current: 'v2' })
    expect(rotated.currentVersion()).toBe('v2')
    expect(Buffer.from(await rotated.unwrap(wrapped, { identityId: alice })).equals(key)).toBe(true)

    const retired = createLocalProfileKeyWrapper({ keys: { v2: master(2) }, current: 'v2' })
    await expect(retired.unwrap(wrapped, { identityId: alice })).rejects.toThrow()
  })

  it('refuses a short master key or a current version it does not hold', () => {
    expect(() => createLocalProfileKeyWrapper({ keys: { v1: Buffer.alloc(16).toString('base64') }, current: 'v1' })).toThrow(TypeError)
    expect(() => createLocalProfileKeyWrapper({ keys: { v1: master(1) }, current: 'v2' })).toThrow(TypeError)
  })
})
