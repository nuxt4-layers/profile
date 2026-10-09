# profile

Nuxt 4 foundation layer for the personal data that describes a person: what is held, who may see it, and how it is corrected, exported, anonymised or erased, under the person's control.

Part of the `nuxt4-layers` Identity and Access Management (IAM) suite, with [`authentication`](https://github.com/nuxt4-layers/authentication), `identity`, [`authorisation`](https://github.com/nuxt4-layers/authorisation) and [`iam-integration`](https://github.com/nuxt4-layers/iam-integration).

**Status:** phase 1 of 5, foundation and storage: the contract, composition ports, encrypted PostgreSQL storage, disclosure rules, the departure data policy, Identity's events, erasure, export and key rotation. Endpoints and pages follow (see [docs/roadmap.md](docs/roadmap.md)).

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

## Interfaces

| Direction | Interface | Purpose |
|---|---|---|
| Consumes from Identity | Disclosure-context port | The viewer's relationship to each person, the person's standing, and the group's departure data policy |
| Consumes from Identity | Events `identity.provisioned`, `membership.ended`, `identity.closed` | Create the record, keep how a leaver is shown, erase on closure |
| Consumes from the host | Key-wrapping port | Wraps each person's data key with a versioned host key (KMS, HSM, vault) |
| Provides to domain capabilities | `lookupProfileDisplayNames` | Names for up to 200 identifiers, as the viewer may see them |
| Provides to the person | Own record, disclosure settings, departure anonymity, export | Through server functions now; endpoints and pages in phases 2 and 3 |
| Publishes | `profile.created`, `profile.changed`, `profile.departure-anonymised`, `profile.anonymised` | Identifiers, attribute names and codes only |

## Documentation

- [Contract](docs/contracts.md): the record, disclosure, departures, encryption and erasure, events, ports and server functions
- [Composition contract](docs/composition-contract.md): what a host supplies
- [Threat model](docs/threat-model.md): control register and gaps
- [Design decisions](docs/design-decisions.md) and [roadmap](docs/roadmap.md)

## Commands

- `pnpm install`, then `pnpm dev:prepare`
- `pnpm check`: typecheck and tests. The PostgreSQL suite needs `PROFILE_TEST_DATABASE_URL` (admin URL of a local, disposable PostgreSQL 16); it skips locally without it and fails in CI
- `pnpm build:playground`: proves the layer composes in a host

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
