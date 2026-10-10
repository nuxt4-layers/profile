# Composition Contract

How a host composes `@nuxt4-layers/profile`. The capability's own rules are in [the contract](contracts.md).

## Dependencies

Profile has **no package dependency** on Identity, Authentication, Authorisation, any database driver, any key service or any UI library. The manifest (`capability.json`) declares Identity as a required **capability**: the host connects Identity's port and events to Profile's. The default pages are styled through Theme Manager's SemanticPresentationTheme vocabulary, an optional capability: without it they work, unstyled.

## What the host does

- Pins a compatible version and adds the layer to `extends`.
- Supplies the database (`provideProfileDatabase`): a `pg` pool connecting as a runtime role that owns nothing, the schema (default `profile`), and the migration pool and runtime role name, so that `migrateProfileDatabase()` runs as the owner and grants the runtime role data access only (ADR-0006 §5). Calls `migrateProfileDatabase()` once from its Nitro plugin.
- Supplies a key wrapper (`provideProfileKeyWrapper`) over its KMS, HSM or vault. It must bind `context.identityId` to each wrapping, version its wrapping key, and reject on failure. `createLocalProfileKeyWrapper({ keys, current })` wraps with master keys the host holds itself, for development and self-hosted deployments.
- Supplies Identity's disclosure-context port (`provideProfileDisclosureContext`), passing Identity's answer through unchanged.
- For the endpoints, supplies a subject resolver (`provideProfileSubjectResolver`) that returns the signed-in principal from Authentication (its `principalId`, `authenticatedAt` and `assurance`), or null, and sets `NUXT_PROFILE_BASE_URL` to its public origin. iam-integration's `identitySubjectResolverFromAuthentication` has the same shape.
- Relays Identity's events to `applyProfileIdentityEvent`, and Profile's outbox through `relayProfileOutbox` to whoever caches names.
- Schedules `rewrapProfileKeys()` after each change of wrapping-key version, and retires a version only when `profileKeyVersionsInUse()` no longer lists it and every backup taken under it has expired.
- For the default pages (contract §13): imports Theme Manager's `presentation.css` and then `@nuxt4-layers/profile/tailwind.css` into its Tailwind stylesheet, and sets `profile.routes.signIn` to its sign-in page; or moves the pages, or turns them off (`profile: { pages: { enabled: false } }`).
- Names people on every page through `ProfilePersonName`. Where Identity's pages are composed, the host's own `IdentityPersonName` (same `identityId` prop) passes the identifier and the group in view through to it, as in the example below. Calls `forgetProfileNames()` if the viewer can change without a full page load.
- Takes `subjectId` and `viewerId` only from the signed-in principal.
- Integration-tests the composed system.

## Example Nitro plugin

```ts
import { getAuthenticatedPrincipal, getIdentityDisclosureContext } from '#imports'

export default defineNitroPlugin(() => {
  provideProfileDatabase({ dialect: 'postgres', pool: runtimePool, migrationPool: ownerPool, runtimeRole: 'profile_runtime' })
  provideProfileKeyWrapper(myKmsKeyWrapper)
  provideProfileDisclosureContext({ describe: (request, options) => getIdentityDisclosureContext().describe(request, options) })
  provideProfileSubjectResolver({ resolve: event => getAuthenticatedPrincipal(event) })
  migrateProfileDatabase()
})
```

Backing Identity's `IdentityPersonName` with Profile, in the host's `app/components/IdentityPersonName.vue`:

```vue
<script setup lang="ts">
defineProps<{ identityId: string }>()
const route = useRoute()
const groupId = computed(() => (typeof route.params.groupId === 'string' ? route.params.groupId : null))
</script>

<template>
  <ProfilePersonName :identity-id="identityId" :group-id="groupId" />
</template>
```

Required ports fail closed: a missing one throws `ProfileCompositionError`; there is no in-memory store and no default key.
