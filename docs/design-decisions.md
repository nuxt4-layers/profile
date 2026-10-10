# Design Decisions

Decisions taken in Profile's design round, with the alternatives considered.

## 1. Scope of the first round

Foundation and storage together: the contract, composition, PostgreSQL storage, encryption, Identity's events, erasure and export. Endpoints and pages follow as separate phases.

## 2. Attributes

OpenID Connect standard claim names: `name`, `given_name`, `family_name`, `preferred_username`, `locale`, `zoneinfo`, plus contact `email` and `phone_number`, independent of Authentication's sign-in identifiers. No picture or postal address yet: a picture needs a file-storage port and image checks.

## 3. Disclosure

Per attribute, per context: `nobody`, `group` or `tenant`. Defaults: name to fellow group members, everything else to nobody. Per-group overrides and a single all-or-nothing setting were considered; the first adds much to explain and test, the second forces all-or-nothing on contact details.

## 4. Display name

The person picks which of their names others see (`name`, `preferred_username` or `given_name`). If it is not visible to the viewer, the neutral fallback is shown. A fixed rule (name, else nickname) was considered and rejected: the person should decide.

## 5. Contact details

Stored unverified (`*_verified: false`) and never used for sending. Verification needs a host notification port and one-time codes, deferred to phase 4.

## 6. Paused people

Hidden from listings and profiles, but still attributed on past contributions. Hiding attribution too was considered; it would erase a paused person's history from others' view while they may return.

## 7. Encryption and backups

Each person's attributes are encrypted with their own data key, which Profile stores only wrapped by the host's versioned key port, so erasure can reach backups (crypto-shredding). Keeping keys in Profile's database means a backup also holds the wrapped key; the host therefore rotates its wrapping key, Profile re-wraps live keys, and the host retires an old version once its backups expire. A separate key-store port (destroying each key in a KMS at once) was considered; it is stronger but asks every host to run a second store.

## 8. The HTTP API (phase 2)

- **Display-name lookups from the browser:** an endpoint, so client-side pages can show names, limited to 60 lookups a minute per viewer. Server-only lookups were considered; they would force every page that shows names to render on the server.
- **Recent sign-in:** for the data export (as the data-subject process requires) and for changing a contact detail. Names, locale, time zone and disclosure settings can be changed in any signed-in session. Requiring it for every change was considered and rejected as too frequent an interruption.
- **No erasure endpoint:** erasure follows account closure, or an operator acting on a verified request, so there is one path, as the data-subject process describes. The person can remove any attribute themselves.
- **Lost updates:** each change carries the version it was made against, and a stale one is refused. Last write wins was considered; it lets one tab undo another's edit silently.

## 9. The default pages (phase 3)

- **Which pages:** the person's own profile, one page with sections for details, disclosure and the download, and a page for another person's profile as the viewer may see it. Separate pages per area were considered; one page keeps the record's version in one place, so the sections never undo each other. Leaving the person page to hosts was considered; every host would rebuild the same disclosure-bound view.
- **The person-name component:** `ProfilePersonName` takes the identifier, the group in view and the purpose as props, and the host's `IdentityPersonName` is a thin wrapper that passes Identity's route through. Profile overriding `IdentityPersonName` itself was considered and rejected: it would tie Profile to Identity's component name and to the order of layers, against the rule that members never import one another.
- **Links from names:** optional and off by default, and only for a disclosed name while the person page is on; a fallback ("Member", "Former member") never links, so a link says nothing about who exists. Always linking was considered; it spends lookups on pages that only list names.
- **The document title** of the person page stays "Profile", never the name, so names do not reach browser history, tab lists or analytics through it.
- **Departure anonymity in one group:** the setting for every future departure is on the page; choosing it for one group already left needs that group's name, which is Identity's, and follows in phase 4 with the requests.
