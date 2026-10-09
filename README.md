# profile

Nuxt 4 foundation layer for the personal data that describes a person: what is held, who may see it, and how it is corrected, exported, anonymised or erased, under the person's control.

Part of the `nuxt4-layers` Identity and Access Management (IAM) suite, with [`authentication`](https://github.com/nuxt4-layers/authentication), `identity`, [`authorisation`](https://github.com/nuxt4-layers/authorisation) and [`iam-integration`](https://github.com/nuxt4-layers/iam-integration).

**Status:** not started. Profile is designed after Identity, because it is keyed by Identity's identifiers and consumes Identity's events.

## Owns

- The personal data that describes a person: names, contact details and personal preferences, keyed by an opaque Identity identifier.
- What each context may see (fellow group members, the tenant, nobody), under the person's control.
- Applying each group's departure data policy (`keep-name`, `pseudonymise`, `anonymise`) to how a leaver is shown, and the leaver's right to anonymisation.
- The person's requests for access, correction, export and erasure, coordinating the other suite members' parts.
- Anonymisation by unlinking: deleting the record that links an identifier to a person, so other capabilities' data never needs rewriting.

## Never owns

| Not here | Owned by |
|---|---|
| Credentials and sign-in identifiers (including a sign-in email address) | Authentication |
| Identities, groups, tenants and memberships | Identity |
| Roles, grants and access decisions | Authorisation |
| Domain records (they hold identifiers, never names) | Domain capabilities |

Profile may hold the same email address as a sign-in identifier held by Authentication, as an independent contact detail. Changing one does not change the other unless the person asks for both, and erasure covers both.

## Planned interfaces

These are specified in `iam-integration` and will be defined in Profile's own contract:

| Direction | Interface | Purpose |
|---|---|---|
| Consumes from Identity | Disclosure-context port | The viewer's relationship to the subject, and the group's departure data policy |
| Consumes from Identity | Events `identity.provisioned`, `identity.paused`, `identity.resumed`, `identity.suspended`, `identity.closed`, `membership.*` | Create, hide, show or anonymise records |
| Provides to domain capabilities | Display names | Names for a list of identifiers, filtered by the viewer's disclosure context |
| Provides to the person | Data-subject requests | Access, correction, export and erasure, coordinated across the suite |
| Publishes | `profile.anonymised` | Tells capabilities that cached names to drop them |

## Governing decisions and specifications

- [ADR-0005 — Identity and Access Management Suite](https://github.com/nuxt4-layers/platform-architecture/blob/1a6d9da53c4957ff16ae7a28269c49a39d23cff2/docs/decisions/ADR-0005-iam-suite.md)
- [ADR-0006 — Polyglot Persistence and Data-Store Security](https://github.com/nuxt4-layers/platform-architecture/blob/1a6d9da53c4957ff16ae7a28269c49a39d23cff2/docs/decisions/ADR-0006-polyglot-persistence-and-data-store-security.md) (§6 places sign-in identifiers in Authentication)
- [Data Store Security Standard v0.1](https://github.com/nuxt4-layers/platform-architecture/blob/1a6d9da53c4957ff16ae7a28269c49a39d23cff2/docs/standards/data-store-security-v01.md)
- [IAM suite architecture](https://github.com/nuxt4-layers/iam-integration/blob/78c69287c00b22a72c245243aa60e5cf7e5d954c/docs/architecture.md)
- [Joining and leaving](https://github.com/nuxt4-layers/iam-integration/blob/78c69287c00b22a72c245243aa60e5cf7e5d954c/docs/processes/joining-and-leaving.md) (departure data policy)
- [Data-subject requests](https://github.com/nuxt4-layers/iam-integration/blob/78c69287c00b22a72c245243aa60e5cf7e5d954c/docs/processes/data-subject-requests.md)
- [Account closure](https://github.com/nuxt4-layers/iam-integration/blob/78c69287c00b22a72c245243aa60e5cf7e5d954c/docs/processes/account-closure.md)

## Documentation checks

`python3 scripts/check_markdown.py` checks headings, local links, and that links to other `nuxt4-layers` documents are pinned to a tag or commit.
