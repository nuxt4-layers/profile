# @nuxt4-layers/profile — notes for Claude

## What this is
Nuxt 4 foundation layer for the personal data that describes a person (what is held, who may see it, how it is anonymised), under the person's control. A member of the IAM suite (ADR-0005). Governed by `nuxt4-layers/platform-architecture`; persistence follows ADR-0002 and ADR-0006. Cross-member processes live in `nuxt4-layers/iam-integration`. British spelling everywhere, including code and the manifest.

## Commands
- `pnpm install`, then `pnpm dev:prepare` for Nuxt types. Never add a `prepare`/`postinstall` script: Git installs would then pull devDependencies into hosts
- `pnpm check` = `nuxt typecheck` + `vitest run`; run it after every code change
- `pnpm build:playground` proves the layer composes in a host
- Single test file: `pnpm vitest run tests/<name>.test.ts`
- `tests/database.test.ts` and `tests/http.test.ts` need `PROFILE_TEST_DATABASE_URL` (admin URL of a local, disposable PostgreSQL 16). They skip locally without it and fail in CI
- Never edit a released migration in `server/database/migrations.ts`; add a new one
- `python3 scripts/check_markdown.py` checks headings, local links and pinned cross-repository links; run it after every documentation change

## Rules
- Profile is the only canonical source of the data that describes a person. Never store sign-in identifiers, credentials, groups, memberships or permissions here: they are Authentication's, Identity's and Authorisation's.
- Contract (`contracts/`, `shared/`) imports only zod. No Nuxt, Vue, h3, server code, drivers, key services or other `@nuxt4-layers/*` packages. Enforced by `tests/contracts.test.ts`.
- Public surface: package root, `./contracts`, `./capability`, the `provide*` server functions, `createLocalProfileKeyWrapper`, `migrateProfileDatabase`, `getOwnProfile`, `updateProfile`, `setProfileDisclosure`, `anonymiseProfileDeparture`, `lookupProfileDisplayNames`, `viewProfile`, `exportProfileData`, `applyProfileIdentityEvent`, `eraseProfile`, `rewrapProfileKeys`, `profileKeyVersionsInUse`, `relayProfileOutbox`, `consumeProfileLookup`, the `/api/profile/*` endpoints and `useProfile()`. `server/internal` and `server/database` are private.
- Members never import one another. Identity reaches Profile through the host: its disclosure-context port and relayed events.
- Every attribute value, and every kept departure name, is encrypted with the person's own key before it reaches the database, with the identity and purpose bound as additional data. Data keys are stored only wrapped by the host's `ProfileKeyWrapper`. Never store or log a value in plaintext. Keep `tests/database.test.ts` proving it.
- Erasure deletes the record, departures and wrapped key, and records the identifier as erased; no record is ever recreated for it. Key rotation re-wraps live keys only. Keep the rotation and erasure test.
- Disclosure: the person chooses each attribute's audience; secure defaults (name to group, all else to nobody). Standing comes from Identity at every lookup, never cached. Hidden answers look the same whether or not a person or record exists.
- The caller passes `subjectId` and `viewerId` from the signed-in principal, never from a request body.
- Endpoints (`server/api/profile/`) take the subject only from `requireSubject` (the host's resolver); parse bodies with strict schemas through `readJson`; call the server functions, never SQL; and are wrapped in `profileHandler`. Export and contact-detail changes need `requireRecentSignIn`; lookups count against the rate limit; changes carry `expectedVersion`. `tests/http.test.ts` mounts every file, so a new endpoint is tested by being added. Never add an erasure endpoint: erasure follows account closure.
- `useProfile()` is for the user experience only and decides nothing.
- Events and logs carry identifiers, attribute names and codes only.
- Required ports fail closed. No implicit in-memory store and no default key.
- Defaults are secure; loosening a default needs a documented risk treatment.
- Keep `docs/contracts.md`, `docs/threat-model.md` (control register) and `docs/roadmap.md` in step with code. Link to other `nuxt4-layers` documents pinned to a commit.
- Package manager: pnpm. Commit `pnpm-lock.yaml`.
