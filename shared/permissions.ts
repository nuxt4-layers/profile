/**
 * Profile's permissions, in Authorisation's `<resource>:<action>` grammar,
 * for the host to pass to `provideAuthorisationPermissions` and to name in
 * the built-in roles (iam-integration's `rolesWithIdentityPermissions`).
 * Each acts on a group: the resource is the group itself.
 */
export interface ProfilePermissionDefinition {
  name: string
  description: string
  risk: 'low' | 'medium' | 'high' | 'critical'
  effect: 'view' | 'change'
}

/**
 * A suspended member's name, to the administrators of a group they belong
 * to. `high`, because it discloses personal data that is otherwise hidden:
 * Authorisation's wildcards never cover it, so `member` and `viewer` never
 * hold it, and it needs `aal2`.
 */
export const PROFILE_SUSPENDED_PEOPLE_PERMISSION = 'profile.suspended-people:view'

export const PROFILE_PERMISSIONS: readonly ProfilePermissionDefinition[] = Object.freeze([
  Object.freeze({
    name: PROFILE_SUSPENDED_PEOPLE_PERMISSION,
    description: 'See the names of the group\'s suspended members',
    risk: 'high',
    effect: 'view',
  }),
])
