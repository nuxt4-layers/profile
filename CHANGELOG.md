# Changelog

All notable changes to `@nuxt4-layers/profile`. The package follows [semantic versioning](https://semver.org/), and contract version 1 is frozen for 1.x.

## Unreleased

- The layer's own tests pass on Windows as well as on Linux and macOS: the paths they compare with import specifiers and routes are written with `/` on every platform (`tests/support/paths.ts`). On Windows the contract, architecture and endpoint tests used to fail, or check nothing.

## 1.0.0 (2026-10-11)

The first stable release: everything in contract version 1 ([docs/contracts.md](docs/contracts.md)).

- The person's record under their control: every value encrypted with their own key, wrapped by the host's key service, with key rotation.
- Disclosure chosen by the person, the departure data policy, display-name lookups and contact-detail verification.
- Data-subject requests, legal holds, erasure on closure, export, end of life and retention.
- The `/api/profile/*` endpoints and the accessible default pages, including `ProfilePersonName`.
