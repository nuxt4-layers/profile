import type { DisclosureSettings, DisplayName, LookupPurpose, ProfileChanges, ProfileOwnView, ProfilePersonView } from '../../contracts'
import { PROFILE_API_PREFIX } from '../../contracts'

/**
 * The client side of Profile's API (docs/contracts.md §12).
 *
 * For the user experience only: it decides nothing. Every request is decided
 * again on the server, which answers with a contract error
 * (`ProfileErrorBody`) when it refuses. Uses `useRequestFetch()` so that the
 * session cookie is forwarded during server-side rendering.
 */
export function useProfile() {
  // Untyped by route on purpose, as Identity's and Authentication's: Nitro's
  // typed-route inference over a host's whole route table can exceed
  // TypeScript's depth limit in larger compositions.
  const request = useRequestFetch() as unknown as (url: string, options: { method?: string, query?: Record<string, string>, body?: object }) => Promise<unknown>
  const at = (path: string) => `${PROFILE_API_PREFIX}${path}`

  return {
    me: () => request(at('/me'), {}) as Promise<ProfileOwnView>,
    update: (expectedVersion: number, changes: ProfileChanges) =>
      request(at('/me'), { method: 'PATCH', body: { expectedVersion, changes } }) as Promise<ProfileOwnView>,
    setDisclosure: (expectedVersion: number, settings: DisclosureSettings) =>
      request(at('/me/disclosure'), { method: 'PUT', body: { expectedVersion, settings } }) as Promise<ProfileOwnView>,
    anonymiseDeparture: (groupId: string) =>
      request(at(`/me/departures/${groupId}/anonymise`), { method: 'POST' }) as Promise<{ groupId: string, status: 'anonymised' }>,
    exportData: () => request(at('/me/export'), {}) as Promise<unknown>,
    displayNames: (subjectIds: string[], purpose: LookupPurpose, groupId: string | null = null) =>
      request(at('/display-names'), { method: 'POST', body: { subjectIds, groupId, purpose } }) as Promise<{ subjectId: string, displayName: DisplayName }[]>,
    person: (subjectId: string, groupId?: string) =>
      request(at(`/people/${subjectId}`), { query: groupId ? { groupId } : undefined }) as Promise<ProfilePersonView>,
  }
}
