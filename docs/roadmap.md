# Roadmap

Each phase is delivered as its own pull request with tests, and keeps `pnpm check` green.

| Phase | Scope | Status |
|---|---|---|
| 0. Design round | Scope, OIDC attributes, per-attribute disclosure, display name choice, unverified contact details, paused attribution, envelope keys with wrapping-key rotation ([design decisions](design-decisions.md)) | Complete |
| 1. Foundation and storage | Package, manifest, public contract (record, disclosure, departure policy, events, errors, ports), composition registry (fail closed), PostgreSQL schema with runtime-role grants, per-person envelope encryption, key rotation, Identity event handling (provisioning, departures, closure), erasure, export, transactional outbox, docs, threat model, CI, playground | In review |
| 2. Administration | `/api/profile/*` endpoints for the person's own record, disclosure and departure choices, and display-name lookups for the host's pages; `useProfile()` for the user experience only | Planned |
| 3. Default pages | Accessible (WCAG 2.2 AA), localisable profile and disclosure pages through the `SemanticPresentationTheme` vocabulary; `ProfilePersonName` for the host's `IdentityPersonName` | Planned |
| 4. Requests and verification | Data-subject request coordination and legal holds (iam-integration's process); contact-detail verification through a notification port; administrator view of suspended people through Authorisation | Planned |
| 5. Host integration | Composition into `platform-test-harness` with Identity's disclosure port and events through iam-integration's adapters | Planned |

## Dependencies on other capabilities

- **Identity** issues the identifiers, announces provisioning, departures and closure, and answers the disclosure-context port.
- **Authentication** supplies the signed-in principal whose identifier is the subject or viewer. It is never a source of profile data.
- **Authorisation** will answer who is an administrator, for the view of suspended people (phase 4).
