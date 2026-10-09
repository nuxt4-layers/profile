import type { ProfileDatabase, ProfileDisclosureContextPort, ProfileKeyWrapper, ProfileSubjectResolver } from '../../contracts'
import { ProfileCompositionError } from '../../contracts'

/**
 * Composition registry. The host calls the `provide*` functions from a Nitro
 * plugin; the layer's server code calls the `use*` functions.
 *
 * Required ports fail closed: using one before it is supplied throws
 * `ProfileCompositionError`. There is no implicit store and no implicit key.
 */

let database: (ProfileDatabase & { schema: string }) | null = null
let keyWrapper: ProfileKeyWrapper | null = null
let disclosureContext: ProfileDisclosureContextPort | null = null
let subjectResolver: ProfileSubjectResolver | null = null

export function provideProfileDatabase(next: ProfileDatabase): void {
  if (next?.dialect !== 'postgres' || typeof next.pool?.query !== 'function' || typeof next.pool.connect !== 'function') {
    throw new TypeError('provideProfileDatabase expects { dialect: \'postgres\', pool } with a pg-compatible pool.')
  }
  const schema = next.schema ?? 'profile'
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new TypeError(`Invalid profile schema name '${schema}'.`)
  if (next.runtimeRole !== undefined && !/^[a-z_][a-z0-9_]{0,62}$/.test(next.runtimeRole)) throw new TypeError(`Invalid runtime role name '${next.runtimeRole}'.`)
  database = { ...next, schema }
}

export function provideProfileKeyWrapper(next: ProfileKeyWrapper): void {
  if (typeof next?.currentVersion !== 'function' || typeof next.wrap !== 'function' || typeof next.unwrap !== 'function') {
    throw new TypeError('provideProfileKeyWrapper expects an object with currentVersion(), wrap(key, context) and unwrap(key, context) functions.')
  }
  keyWrapper = next
}

export function provideProfileDisclosureContext(next: ProfileDisclosureContextPort): void {
  if (typeof next?.describe !== 'function') {
    throw new TypeError('provideProfileDisclosureContext expects an object with a describe(request, options) function.')
  }
  disclosureContext = next
}

/** The signed-in person for each `/api/profile/*` request, from Authentication through the host. */
export function provideProfileSubjectResolver(next: ProfileSubjectResolver): void {
  if (typeof next?.resolve !== 'function') {
    throw new TypeError('provideProfileSubjectResolver expects an object with a resolve(event) function.')
  }
  subjectResolver = next
}

export function useProfileSubjectResolver(): ProfileSubjectResolver {
  if (!subjectResolver) throw new ProfileCompositionError('ProfileSubjectResolver')
  return subjectResolver
}

export function useProfileDatabase(): ProfileDatabase & { schema: string } {
  if (!database) throw new ProfileCompositionError('ProfileDatabase')
  return database
}

export function useProfileKeyWrapper(): ProfileKeyWrapper {
  if (!keyWrapper) throw new ProfileCompositionError('ProfileKeyWrapper')
  return keyWrapper
}

export function useProfileDisclosureContext(): ProfileDisclosureContextPort {
  if (!disclosureContext) throw new ProfileCompositionError('ProfileDisclosureContext')
  return disclosureContext
}

/** Test helper: removes every supplied port. */
export function clearProfileComposition(): void {
  database = null
  keyWrapper = null
  disclosureContext = null
  subjectResolver = null
}
