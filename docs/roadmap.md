# Roadmap

Each phase is delivered as its own pull request with tests, and keeps `pnpm check` green.

| Phase | Scope | Status |
|---|---|---|
| 0. Design round | Scope, OIDC attributes, per-attribute disclosure, display name choice, unverified contact details, paused attribution, envelope keys with wrapping-key rotation ([design decisions](design-decisions.md)) | Complete |
| 1. Foundation and storage | Package, manifest, public contract (record, disclosure, departure policy, events, errors, ports), composition registry (fail closed), PostgreSQL schema with runtime-role grants, per-person envelope encryption, key rotation, Identity event handling (provisioning, departures, closure), erasure, export, transactional outbox, docs, threat model, CI, playground | Complete |
| 2. Administration | `/api/profile/*` endpoints for the person's own record, disclosure and departure choices, export, and display-name lookups for the host's pages; subject-resolver port; origin check; recent sign-in for export and contact details; record versions against lost updates; per-viewer lookup rate limit; no erasure endpoint; `useProfile()` for the user experience only | Complete |
| 3. Default pages | Accessible (WCAG 2.2 AA), localisable own-profile page (details, disclosure, display name, departure choice, data download) and person page through Theme Manager's `SemanticPresentationTheme` vocabulary (pinned to Theme Manager 0.2.1, commit `934d1bd`); movable or disabled; framing, caching and referrer headers; `ProfilePersonName` with batched, browser-only lookups for the host's `IdentityPersonName`; browser tests with axe in CI | Complete |
| 4. Requests and verification | Data-subject request coordination and legal holds (iam-integration's process: requests and parts, the coordination port, archives sealed with the person's key, holds deferring erasure on closure, escalation); contact-detail verification through a notification port (one-time codes as keyed digests bound to the value); an `administration` lookup naming suspended members to a group's administrators through Authorisation (`profile.suspended-people:view`, high), and the membership's own standing in the group context; departures and requests pages, `ProfileGroupName` backed by Identity's names through the host; the missing `presentation/pairings.ts` restored ([design decisions](design-decisions.md) §10) | In review |
| 5. Host integration | Composition into `platform-test-harness` with Identity's disclosure port and events through iam-integration's adapters; the harness's `IdentityPersonName` backed by `ProfilePersonName`; phase 4's ports, holds and `ProfileGroupName` composed there | Complete for phases 1 to 3; phase 4 in review |

## Dependencies on other capabilities

- **Identity** issues the identifiers, announces provisioning, departures and closure, and answers the disclosure-context port.
- **Authentication** supplies the signed-in principal whose identifier is the subject or viewer. It is never a source of profile data.
- **Authorisation** answers whether a viewer may see a group's suspended members (`profile.suspended-people:view`), and exports and erases its own part of a person's data.
- **Authentication** exports its own part of a person's data (sign-in identifiers, factors, sessions); it is never a source of profile data.
