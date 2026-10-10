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
- Relays Identity's events to `applyProfileIdentityEvent` (iam-integration's `createIdentityEventHandler` with `applyProfileEvent`, `heldParts: profileLegalHoldParts` and `recordRequestPart: recordProfileRequestPart`), and Profile's outbox through `relayProfileOutbox` to whoever caches names and to iam-integration's `createProfileEventHandler`, which carries out erasures a legal hold deferred.
- For data-subject requests (contract §14), supplies the coordination port (`provideProfileRequestCoordinator`) from iam-integration's `profileRequestCoordinatorFromMembers` over Identity's, Authentication's and Authorisation's exports, and gives its operators tooling over `openProfileRequest`, `settleProfileRequestPart`, `placeProfileLegalHold` and `releaseProfileLegalHold`, never over HTTP. Schedules `runProfileMaintenance()` every few minutes, and alerts operators on `profile.request-escalated`.
- For the administrators' view of suspended members, supplies the access-decision port (`provideProfileAccessDecision`) from iam-integration's `profileAccessDecisionFromAuthorisation`, passes `PROFILE_PERMISSIONS` to Authorisation's catalogue and names them in its built-in roles (`rolesWithIdentityPermissions`), and asks for names with the purpose `administration` on its group administration pages.
- For contact-detail verification (contract §15), supplies a notifier (`provideProfileNotifier`) that delivers the code by email or SMS, in the person's locale, and nothing else.
- Optionally supplies the suite's clock (`provideProfileClock`, contract §16): the same `{ now(): Date }` it gives every member, or none, so that each uses the system clock. Only its server code composes it, and a clock that can be moved is for tests only.
- Schedules `rewrapProfileKeys()` after each change of wrapping-key version, and retires a version only when `profileKeyVersionsInUse()` no longer lists it and every backup taken under it has expired.
- For the default pages (contract §13): imports Theme Manager's `presentation.css` and then `@nuxt4-layers/profile/tailwind.css` into its Tailwind stylesheet, and sets `profile.routes.signIn` to its sign-in page; or moves the pages, or turns them off (`profile: { pages: { enabled: false } }`).
- Backs `ProfileGroupName` with Identity's name for the group, through a component of that name in its own app (below), so the departures page names the groups the person left.
- Sets `profile.routes.closeAccount` (`NUXT_PUBLIC_PROFILE_ROUTES_CLOSE_ACCOUNT`) to the page where the person closes their account, which is how they have their data deleted.
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
  provideProfileRequestCoordinator(profileRequestCoordinatorFromMembers({ exportIdentity: exportIdentityData, exportAuthentication: exportAuthenticationData, exportAuthorisation: exportAuthorisationData }))
  provideProfileAccessDecision(profileAccessDecisionFromAuthorisation({ authorise }))
  provideProfileNotifier(myNotifier)
  provideProfileClock(suiteClock) // optional: the same clock as every other member, or none
  migrateProfileDatabase()
})
```

Backing `ProfileGroupName` with Identity's names of the groups the person left, in the host's `app/components/ProfileGroupName.vue`:

```vue
<script setup lang="ts">
const props = defineProps<{ groupId: string }>()
const { data: me } = await useAsyncData('identity-me', () => useIdentity().me())
const name = computed(() => me.value?.formerGroupNames.find(group => group.groupId === props.groupId)?.name ?? null)
</script>

<template>
  <span :data-group-id="groupId">{{ name ?? 'A group you left' }}</span>
</template>
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
