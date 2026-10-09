import { describe, expect, it } from 'vitest'
import type { DisclosureInput, DisclosureSettings, ProfileAttributes } from '../contracts'
import { DEFAULT_DISCLOSURE_SETTINGS, discloseAttributes, discloseDisplayName } from '../contracts'

const attributes: ProfileAttributes = { name: 'Ada Lovelace', given_name: 'Ada', preferred_username: 'countess', email: 'ada@example.com', email_verified: false }
const settings = (change: Partial<Omit<DisclosureSettings, 'audiences'>> & { audiences?: Partial<DisclosureSettings['audiences']> } = {}): DisclosureSettings => ({
  ...DEFAULT_DISCLOSURE_SETTINGS,
  ...change,
  audiences: { ...DEFAULT_DISCLOSURE_SETTINGS.audiences, ...change.audiences },
})
const input = (change: Partial<DisclosureInput> = {}): DisclosureInput => ({
  relationship: 'same-group',
  standing: 'visible',
  purpose: 'listing',
  attributes,
  settings: settings(),
  departureAttribution: null,
  departure: null,
  ...change,
})

describe('disclosure: attributes', () => {
  it('shows the person everything of their own, whatever their standing', () => {
    expect(discloseAttributes(input({ relationship: 'self', standing: 'paused' }))).toEqual(attributes)
  })

  it('shows each attribute only to its audience', () => {
    const open = settings({ audiences: { email: 'tenant', given_name: 'group' } })
    expect(discloseAttributes(input({ settings: open }))).toEqual({ name: 'Ada Lovelace', given_name: 'Ada', email: 'ada@example.com', email_verified: false })
    expect(discloseAttributes(input({ settings: open, relationship: 'same-tenant' }))).toEqual({ email: 'ada@example.com', email_verified: false })
    expect(discloseAttributes(input({ settings: open, relationship: 'none' }))).toEqual({})
    expect(discloseAttributes(input({ settings: open, relationship: 'former-member' }))).toEqual({})
  })

  it.each(['paused', 'suspended', 'closing', 'gone'] as const)('shows nothing of someone who is %s in a listing', (standing) => {
    expect(discloseAttributes(input({ standing }))).toEqual({})
    expect(discloseDisplayName(input({ standing }))).toEqual({ kind: 'hidden' })
  })
})

describe('disclosure: display names', () => {
  it('shows the name the person picked, if its audience includes the viewer', () => {
    expect(discloseDisplayName(input())).toEqual({ kind: 'name', value: 'Ada Lovelace' })
    const nickname = settings({ displayName: 'preferred_username' })
    expect(discloseDisplayName(input({ settings: nickname }))).toEqual({ kind: 'hidden' })
    expect(discloseDisplayName(input({ settings: settings({ displayName: 'preferred_username', audiences: { preferred_username: 'group' } }) }))).toEqual({ kind: 'name', value: 'countess' })
    expect(discloseDisplayName(input({ relationship: 'same-tenant' }))).toEqual({ kind: 'hidden' })
  })

  it('keeps a paused person attributed on past contributions, but out of listings', () => {
    expect(discloseDisplayName(input({ standing: 'paused', purpose: 'attribution' }))).toEqual({ kind: 'name', value: 'Ada Lovelace' })
    expect(discloseDisplayName(input({ standing: 'paused', purpose: 'listing' }))).toEqual({ kind: 'hidden' })
  })

  it.each(['suspended', 'closing', 'gone'] as const)('hides someone who is %s even in attribution', (standing) => {
    expect(discloseDisplayName(input({ standing, purpose: 'attribution' }))).toEqual({ kind: 'hidden' })
  })

  it('shows nothing for a person without a record', () => {
    expect(discloseDisplayName(input({ attributes: null }))).toEqual({ kind: 'hidden' })
  })
})

describe('disclosure: departure data policy', () => {
  const left = (change: Partial<DisclosureInput>) => discloseDisplayName(input({ relationship: 'former-member', purpose: 'attribution', ...change }))
  const departure = { name: 'Ada Lovelace', pseudonym: 7, anonymised: false }

  it('applies the group\'s attribution', () => {
    expect(left({ departureAttribution: 'keep-name', departure })).toEqual({ kind: 'name', value: 'Ada Lovelace' })
    expect(left({ departureAttribution: 'pseudonymise', departure })).toEqual({ kind: 'pseudonym', number: 7 })
    expect(left({ departureAttribution: 'anonymise', departure })).toEqual({ kind: 'former-member' })
  })

  it('lets the leaver choose anonymity whatever the group\'s policy', () => {
    expect(left({ departureAttribution: 'keep-name', departure: { name: null, pseudonym: null, anonymised: true } })).toEqual({ kind: 'former-member' })
  })

  it('uses the name kept at departure, not the current one', () => {
    expect(left({ departureAttribution: 'keep-name', departure: { ...departure, name: 'A. Byron' } })).toEqual({ kind: 'name', value: 'A. Byron' })
    expect(left({ departureAttribution: 'keep-name', departure: { ...departure, name: null } })).toEqual({ kind: 'former-member' })
  })

  it('shows "Former member" when nothing was kept', () => {
    expect(left({ departureAttribution: 'keep-name', departure: null })).toEqual({ kind: 'former-member' })
  })
})
