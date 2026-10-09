# Profile Contract (version 1)

`@nuxt4-layers/profile/contracts` is the only supported import path for this capability's types and pure helpers. It imports nothing but `zod`: no driver, key service or other capability's package.

Profile answers two questions: **what describes this person**, and **what may this viewer see of it, now?** It is the only canonical source of the personal data that describes a person. Authentication never stores or seeds it ([IAM architecture](https://github.com/nuxt4-layers/iam-integration/blob/f2dcec8afd27bec5f0a40d73e652dc4644d6ad4c/docs/architecture.md) §1).

## 1. Boundaries

| Concern | Owner | How Profile sees it |
|---|---|---|
| Names, contact details and preferences that describe a person | **Profile** | Its own schema, encrypted per person (§6) |
| Who may see each attribute | **Profile**, under the person's control | Disclosure settings (§4) |
| Identities, groups, tenants, memberships, a person's standing | Identity | The disclosure-context port and Identity's events, adapted by the host |
| Sign-in identifiers, credentials, sessions | Authentication | Never: a contact email here is independent of a sign-in email there |
| Domain records | Domain capabilities | They store Identity's identifiers and ask Profile for names |

## 2. Keys

Every record is keyed by Identity's identifier (a UUIDv7), never derived from personal data. Only identities of kind `person` have a record. A record is created, empty, when Identity announces `identity.provisioned`, or when the person first saves something if that event has not arrived yet.

## 3. The record

The attributes are named as OpenID Connect standard claims:

| Attribute | Rule |
|---|---|
| `name`, `given_name`, `family_name` | Safe names: Unicode NFC, spaces collapsed, no control, format or private-use characters, one script or an allowed combination, 1 to 200 code points |
| `preferred_username` | A safe name of up to 64 code points |
| `locale` | A BCP 47 tag, e.g. `en-GB` |
| `zoneinfo` | An IANA time zone, e.g. `Europe/London` |
| `email` | An email address. `email_verified` is always `false` |
| `phone_number` | E.164, e.g. `+447700900123`. `phone_number_verified` is always `false` |

Contact details are stored unverified in this version, and Profile never sends anything to them. Verification needs a host notification port and comes in a later version.

A change names only the attributes it changes: a value sets one, `null` removes it. An unknown attribute, an empty change or an attempt to set a verification claim is refused (`validation-failed`, with problem codes only, never the value).

## 4. Disclosure settings

The person chooses, for each attribute, its **audience**:

| Audience | Who sees it |
|---|---|
| `nobody` | The person only |
| `group` | People who share a group with them, both memberships in effect |
| `tenant` | Also anyone with a membership in effect in the same tenant |

The defaults are secure: `name` to `group`, everything else to `nobody`.

The person also chooses which name others see as their **display name**: `name`, `preferred_username` or `given_name` (default `name`). Others see it only if that attribute's audience includes them; otherwise they see the neutral fallback.

Finally, `anonymiseOnDeparture` (default `false`) shows the person as "Former member" in every group they leave, whatever the group's policy.

## 5. What a viewer sees

Identity's disclosure-context port says how the viewer is related to each person (`self`, `same-group`, `former-member`, `same-tenant`, `none`) and the person's standing (`visible`, `paused`, `suspended`, `closing`, `gone`). Profile then applies its rules, as the pure functions `discloseAttributes` and `discloseDisplayName`:

1. The person sees everything of their own, whatever their standing.
2. A `suspended`, `closing` or `gone` person is hidden from everyone else.
3. A `paused` person is hidden from listings (`purpose: 'listing'`: member lists, profiles, search), but stays attributed on past contributions (`purpose: 'attribution'`).
4. Otherwise each attribute is shown only to its audience: `same-group` reaches `group` and `tenant`; `same-tenant` reaches `tenant`; `none` reaches nothing.
5. A former member (§5.1) is shown by display name only, never by other attributes.

A display name is returned as a code, never as text the host must translate: `{ kind: 'name', value }`, `{ kind: 'pseudonym', number }`, `{ kind: 'former-member' }` or `{ kind: 'hidden' }`. Presentation localises them, for example "Former member 7", "Former member", "Member". A hidden answer is the same whether or not the person exists or has a record.

### 5.1 Departure data policy

When Identity announces `membership.ended`, Profile keeps how the leaver will be shown in that group ([joining and leaving](https://github.com/nuxt4-layers/iam-integration/blob/f2dcec8afd27bec5f0a40d73e652dc4644d6ad4c/docs/processes/joining-and-leaving.md)):

- the display name fellow members could see at that moment, encrypted with the leaver's key (null if they could see none);
- a pseudonym number, unique and stable within the group;
- nothing at all, if the person chose `anonymiseOnDeparture`.

A later lookup with that group as context applies the group's attribution, which Identity supplies: `keep-name` shows the kept name, `pseudonymise` shows "Former member N", `anonymise` shows "Former member". The leaver may at any time choose anonymity in a group (`anonymiseProfileDeparture`): the kept name and the pseudonym are deleted, whatever the group's policy.

## 6. Encryption and erasure

Every attribute value, and every kept departure name, is encrypted with the person's own 256-bit data key (AES-256-GCM, a fresh nonce for each value). The additional authenticated data binds each value to the identity and its purpose, so a ciphertext cannot be moved to another person or another column. Disclosure settings, identifiers, pseudonym numbers and codes are stored in the clear: none describes the person.

The data key is stored only **wrapped** by the host's `ProfileKeyWrapper`, which binds the identity to the wrapping and versions its wrapping key.

**Erasure** (anonymisation by unlinking, ADR-0005 §2.8) deletes the record, the departures and the wrapped key, and records the identifier as erased so that no record is created for it again. Domain records keep the identifier, which then refers to nobody. It happens when Identity announces `identity.closed`, or through `eraseProfile` with a reason code, and is announced as `profile.anonymised`.

**Backups.** A backup taken before erasure still holds the wrapped key. The host therefore rotates its wrapping key: `rewrapProfileKeys()` moves every live key to the current version, and `profileKeyVersionsInUse()` shows when no live key needs an old one. Once every backup taken under an old version has expired, or sooner, the host retires that version. An erased person's key is never re-wrapped, so their data in older backups becomes unreadable when the version it was wrapped with is retired. Backups never hold plaintext.

## 7. Errors

| Code | HTTP | Meaning |
|---|---|---|
| `unauthenticated` | 401 | No signed-in subject |
| `forbidden` | 403 | Refused. Never says whether a person or record exists |
| `validation-failed` | 400 | Malformed input; problem codes only |
| `unavailable` | 503 | Database, key port or Identity's port failure. Fails closed: no stale or partial answer |

## 8. Events

Written to Profile's transactional outbox in the same transaction as the change, and relayed by the host (`relayProfileOutbox`), at least once, in order.

| Event | Data |
|---|---|
| `profile.created` | `identityId` |
| `profile.changed` | `identityId`, the attribute names changed, whether disclosure changed |
| `profile.departure-anonymised` | `identityId`, `groupId`: drop any name cached for them there |
| `profile.anonymised` | `identityId`, `reasonCode`: drop every name cached for them |

Events carry identifiers, attribute names and codes only: never a value.

Profile consumes `identity.provisioned`, `membership.ended` and `identity.closed`, idempotently by event id. It reads pausing, suspension and closure from the disclosure-context port at each lookup instead, so a standing is never stale.

## 9. Ports

| Port | Required | Purpose |
|---|---|---|
| `ProfileDatabase` | Yes | PostgreSQL pool (runtime role), schema, and optionally the migration pool and the runtime role to grant |
| `ProfileKeyWrapper` | Yes | Wraps and unwraps each person's data key with a versioned host key (KMS, HSM, vault; `createLocalProfileKeyWrapper` for development) |
| `ProfileDisclosureContext` | Yes | Identity's disclosure-context port, read `bounded` |

## 10. Server functions

| Function | Does |
|---|---|
| `migrateProfileDatabase()` | Applies migrations through the migration pool, granting the runtime role data access only |
| `getOwnProfile({ subjectId })` | The person's own record and settings; defaults if none yet; null once erased |
| `updateProfile({ subjectId, changes, correlationId })` | §3 |
| `setProfileDisclosure({ subjectId, settings, correlationId })` | §4 |
| `anonymiseProfileDeparture({ subjectId, groupId, correlationId })` | §5.1 |
| `lookupProfileDisplayNames({ viewerId, subjectIds, groupId?, purpose })` | Up to 200 display names, in the order asked (§5) |
| `viewProfile({ viewerId, subjectId, groupId? })` | One person's display name and disclosed attributes, as a listing |
| `exportProfileData({ subjectId })` | Profile's part of a data-subject export, decrypted |
| `applyProfileIdentityEvent(event)` | §8 |
| `eraseProfile({ identityId, reasonCode, correlationId })` | §6 |
| `rewrapProfileKeys({ limit? })`, `profileKeyVersionsInUse()` | Key rotation (§6) |
| `relayProfileOutbox({ publish, limit? })` | §8 |

The caller supplies `subjectId` and `viewerId` from the signed-in principal, never from a request body. Endpoints and pages follow in later phases.

## 11. Versioning

This is contract version 1, provided by package 0.1. Before 1.0, breaking changes are listed here and in the release notes.
