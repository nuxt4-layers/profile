# Threat Model

Profile holds the personal data that describes people, so its first duty is that the data is seen only by those the person allows, and is truly gone when it is erased. This register follows the [Data Store Security Standard v0.1](https://github.com/nuxt4-layers/platform-architecture/blob/1a6d9da53c4957ff16ae7a28269c49a39d23cff2/docs/standards/data-store-security-v01.md) and ADR-0006.

## 1. Assets

- Each person's attributes: names, contact details, locale and time zone.
- The names kept for leavers, and their pseudonyms.
- Each person's data key, and the host's wrapping keys.
- The disclosure settings, which say who may see what.

## 2. Trust boundaries

| Boundary | Trusted input | Untrusted input |
|---|---|---|
| Browser → host → Profile | The signed-in principal, from the host's subject resolver | Every identifier and value in a request, and its origin |
| Identity → host → Profile | The disclosure-context answer and relayed events, parsed before use | — |
| Profile → key service | The wrapped key and its version | — |
| Host → database | Profile's schema, through a runtime role that owns nothing | Other capabilities' schemas (never read) |

## 3. Control register

| ID | Threat | Control | Evidence | Status |
|---|---|---|---|---|
| T1 | A viewer sees an attribute the person did not disclose to them | Per-attribute audience chosen by the person; secure defaults (name to group, all else to nobody); rules as pure functions over Identity's relationship; unknown relationship or standing fails closed | `tests/disclosure.test.ts`; `tests/database.test.ts` "discloses each attribute" | Implemented |
| T2 | A paused, suspended or closing person is shown | Standing from Identity at every lookup, never cached; paused hidden from listings but attributed; suspended, closing and gone hidden | disclosure and database tests | Implemented |
| T3 | Stale or partial disclosure when Identity fails | The port's answer is parsed; a rejection or malformed answer refuses the whole lookup (`unavailable`) | "fails closed when Identity's port fails" | Implemented |
| T4 | Personal data read from the database, a dump or a backup | Every value encrypted with the person's own key (AES-256-GCM, fresh nonce, identity and purpose bound as AAD); keys stored only wrapped by the host's versioned key; no plaintext in records or outbox | "keeps every value encrypted"; `tests/keys.test.ts` | Implemented |
| T5 | Erased data survives in backups | Erasure deletes the wrapped key; wrapping-key rotation re-wraps live keys only; retiring the old version makes erased people's backed-up data unreadable | "rotates the wrapping key" | Implemented (host retires versions per its backup retention) |
| T6 | A record recreated for an erased person by a replayed event | Erased identifiers are recorded; provisioning and updates refuse them | "rotates the wrapping key" (erasure part) | Implemented |
| T7 | A ciphertext or wrapped key moved to another person | AAD binds identity and purpose; the wrapper binds identity | `tests/keys.test.ts` | Implemented |
| T8 | Personal data in events, logs or errors | Events carry identifiers, attribute names and codes only (schema-checked); validation errors carry problem codes; no value is logged | `tests/contracts.test.ts` | Implemented |
| T9 | Enumeration of people or records | A hidden display name is the same whether or not the person or record exists; `forbidden` is coarse | disclosure tests | Implemented |
| T10 | Spoofed or confusing names | Safe names: NFC, no control, format or private-use characters, no mixed scripts | `tests/contracts.test.ts` "Attributes" | Implemented |
| T11 | Contact details used before they are proven | Stored with `*_verified: false`; Profile sends nothing to them | contract and database tests | Implemented |
| T12 | The runtime role alters the schema or deletes erasure records | Migrations run as the owner; the runtime role gets data access to its tables only, insert-only on `erased`, no ownership, no BYPASSRLS | "applies every migration once" | Implemented |
| T13 | A lost or reordered event leaves Profile inconsistent | Identity events idempotent by event id; records created on first use if provisioning is late; Profile's own events in a transactional outbox, relayed in order, at least once | database tests | Implemented |
| T14 | A missing port leads to an implicit store or key | Required ports fail closed (`ProfileCompositionError`) | `tests/composition.test.ts` | Implemented |
| T15 | A key service failure exposes or loses data | Wrap and unwrap failures refuse the operation (`unavailable`) | "fails closed when the key port fails" | Implemented |
| T17 | Acting on someone else's profile by naming them in a request | Endpoints take the person only from the subject resolver; strict bodies refuse unknown fields such as `subjectId` | `tests/http.test.ts` "takes the person only from the signed-in subject" | Implemented |
| T18 | Cross-site request forgery | State-changing requests need an `Origin` or `Referer` matching the configured base URL; none configured refuses them all | `tests/http.test.ts` "refuses state-changing requests from another origin" | Implemented |
| T19 | A stolen or unattended session exports the person's data or redirects their contact details | Export and contact-detail changes need a sign-in within 15 minutes; export is never cached | `tests/http.test.ts` "needs a recent sign-in" | Implemented |
| T20 | Bulk harvesting of names through the lookup endpoints | Answers gated by Identity's relationships and uniform for unknown people; 60 lookups a minute per viewer, counted in the database | `tests/http.test.ts` "limits each viewer's lookups" | Implemented |
| T21 | Lost updates between tabs or devices | Changes carry the version they were made against; a stale one is refused with `conflict` | `tests/http.test.ts` "refusing a stale version" | Implemented |
| T22 | Values leaking in error responses | Errors carry codes only; validation problems as codes, never the value | `tests/http.test.ts` "validates bodies strictly" | Implemented |
| T23 | The pages show or decide more than the server allows | The pages decide nothing: they reach the server only through `useProfile()`; fields are checked with the contract's schemas and again on the server; no erasure on any page | `tests/presentation.test.ts` "reach the server only through useProfile()", "never offer erasure"; `tests/e2e/pages.spec.ts` | Implemented (phase 3) |
| T24 | Clickjacking, cached pages or leaked paths expose a person's data | Every page is sent with `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Cache-Control: no-store` and `Referrer-Policy: no-referrer` | `tests/e2e/pages.spec.ts` "protects every page" | Implemented (phase 3) |
| T25 | Names leak through the browser: titles, history, a shared cache, or a link that reveals who exists | The person page's title is generic; display names are looked up in the browser only, per viewer, never cached on the server, kept a minute and dropped by `forgetProfileNames()`; unknown, hidden and malformed people read alike, and only disclosed names link | `tests/presentation.test.ts` "keep names out of the document title"; `tests/e2e/pages.spec.ts` "shows another person only what they disclose", "names people by what Profile discloses" | Implemented (phase 3) |
| T26 | Pages unusable by people with disabilities | WCAG 2.2 AA: axe in CI, keyboard journeys, focus on errors, reflow at 320 pixels, non-text contrast with Theme Manager's real styles; colours only through the semantic vocabulary | `tests/e2e/pages.spec.ts`; `tests/presentation.test.ts` "semantic presentation" | Implemented (phase 3) |
| T16 | Supply-chain compromise | Minimal dependencies (`zod`); `minimumReleaseAge`, `blockExoticSubdeps`, frozen lockfile, dependency review | `pnpm-workspace.yaml`, workflows | Implemented |

## 4. Gaps and risk treatments

| Gap | Risk | Treatment |
|---|---|---|
| No page to choose anonymity in one group already left | A leaver who did not set `anonymiseOnDeparture` beforehand needs the host or the API to anonymise them in that group | The endpoint exists; a page follows in phase 4, with the groups' names from Identity |
| No administrator view of suspended people | Administrators who need to know cannot see a suspended person's name | Hidden from everyone for now (the safer reading); a later phase asks Authorisation |
| Data-subject request coordination, legal holds | Erasure and export are per-member functions only | Later phase, with iam-integration's process |
| Contact details unverified | Cannot be used for notification | By design until a notification port exists |
| One key unwrap per person per lookup | Cost and latency with a remote KMS | Host may cache unwrapped keys briefly in its wrapper; a batch port may follow |
| `createLocalProfileKeyWrapper` keeps master keys in application memory | Master keys exposed with the process | For development and self-hosting only; production should wrap through a KMS, HSM or vault |
