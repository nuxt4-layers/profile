import type { ProfileKeyWrapper, WrappedProfileKey } from '../../contracts'
import { aad, open, seal } from '../internal/crypto'

/**
 * PUBLIC. A key wrapper over master keys the host holds itself, for
 * development, tests and self-hosted deployments without a KMS. Production
 * hosts should prefer a wrapper over their KMS, HSM or vault, so that master
 * keys never sit in the application's memory or configuration.
 *
 * `keys` maps each version to a 32-byte master key (base64); `current` names
 * the version new keys are wrapped with. Keep a retired version only until
 * `rewrapProfileKeys()` has moved every key off it and every backup taken
 * under it has expired; then remove it, which makes any erased person's data
 * in those backups unreadable.
 */
export function createLocalProfileKeyWrapper(input: { keys: Readonly<Record<string, string>>, current: string }): ProfileKeyWrapper {
  const masters = new Map<string, Buffer>()
  for (const [version, encoded] of Object.entries(input.keys)) {
    const key = Buffer.from(encoded, 'base64')
    if (key.length !== 32) throw new TypeError(`Profile master key '${version}' must be 32 bytes, base64-encoded.`)
    if (!/^[A-Za-z0-9._:-]{1,200}$/.test(version)) throw new TypeError(`Invalid profile master key version '${version}'.`)
    masters.set(version, key)
  }
  if (!masters.has(input.current)) throw new TypeError(`The current profile master key version '${input.current}' is not among the keys supplied.`)
  const master = (version: string) => {
    const key = masters.get(version)
    if (!key) throw new Error('profile master key version is not available')
    return key
  }
  return {
    currentVersion: () => input.current,
    async wrap(key, context): Promise<WrappedProfileKey> {
      return { version: input.current, wrapped: seal(master(input.current), Buffer.from(key).toString('base64'), aad.wrappedKey(context.identityId)).toString('base64') }
    },
    async unwrap(wrapped, context) {
      return Buffer.from(open(master(wrapped.version), Buffer.from(wrapped.wrapped, 'base64'), aad.wrappedKey(context.identityId)), 'base64')
    },
  }
}
