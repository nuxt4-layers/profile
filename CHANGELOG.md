# Changelog

All notable changes to `@nuxt4-layers/profile`. The package follows [semantic versioning](https://semver.org/), and contract version 1 is frozen for 1.x.

## 1.1.0 (2026-10-21)

- Access requests gain a `configuration` part: the configuration layer's settings for the person's own account, answered through the coordination port like another member's part, and `null` where the host composes no configuration layer. `REQUEST_PARTS` and `COORDINATED_PARTS` gain the value, with migration `0005_configuration_part`; erasure requests are unchanged, since the configuration layer deletes those settings itself on closure. An addition: hosts' coordination ports answer the new part through iam-integration's `profileRequestCoordinatorFromMembers`.
- The layer's own tests pass on Windows as well as on Linux and macOS: the paths they compare with import specifiers and routes are written with `/` on every platform (`tests/support/paths.ts`). On Windows the contract, architecture and endpoint tests used to fail, or check nothing.
- CI pulls its PostgreSQL image from `mirror.gcr.io`.

## 1.0.0 (2026-10-11)

The first stable release: everything in contract version 1 ([docs/contracts.md](docs/contracts.md)).

- The person's record under their control: every value encrypted with their own key, wrapped by the host's key service, with key rotation.
- Disclosure chosen by the person, the departure data policy, display-name lookups and contact-detail verification.
- Data-subject requests, legal holds, erasure on closure, export, end of life and retention.
- The `/api/profile/*` endpoints and the accessible default pages, including `ProfilePersonName`.
