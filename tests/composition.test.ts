import { beforeEach, describe, expect, it } from 'vitest'
import { ProfileCompositionError } from '../contracts'
import {
  clearProfileComposition,
  provideProfileAccessDecision,
  provideProfileDatabase,
  provideProfileDisclosureContext,
  provideProfileKeyWrapper,
  provideProfileNotifier,
  provideProfileRequestCoordinator,
  useProfileAccessDecision,
  useProfileDatabase,
  useProfileDisclosureContext,
  useProfileKeyWrapper,
  useProfileNotifier,
  useProfileRequestCoordinator,
} from '../server/utils/profile-composition'

describe('composition', () => {
  beforeEach(() => clearProfileComposition())

  it('fails closed when a required port is missing: no implicit store, key or directory', () => {
    expect(() => useProfileDatabase()).toThrow(ProfileCompositionError)
    expect(() => useProfileKeyWrapper()).toThrow(ProfileCompositionError)
    expect(() => useProfileDisclosureContext()).toThrow(ProfileCompositionError)
    expect(() => useProfileRequestCoordinator()).toThrow(ProfileCompositionError)
    expect(() => useProfileAccessDecision()).toThrow(ProfileCompositionError)
    expect(() => useProfileNotifier()).toThrow(ProfileCompositionError)
  })

  it('validates what the host supplies', () => {
    const pool = { query: async () => ({}), connect: async () => ({}) }
    expect(() => provideProfileDatabase({ dialect: 'postgres', pool, schema: 'Bad Schema' })).toThrow(TypeError)
    expect(() => provideProfileDatabase({ dialect: 'postgres', pool, runtimeRole: 'x"; drop' })).toThrow(TypeError)
    provideProfileDatabase({ dialect: 'postgres', pool })
    expect(useProfileDatabase().schema).toBe('profile')
    expect(() => provideProfileKeyWrapper({} as never)).toThrow(TypeError)
    expect(() => provideProfileDisclosureContext({} as never)).toThrow(TypeError)
    expect(() => provideProfileRequestCoordinator({} as never)).toThrow(TypeError)
    expect(() => provideProfileAccessDecision({} as never)).toThrow(TypeError)
    expect(() => provideProfileNotifier({} as never)).toThrow(TypeError)
  })
})
