/**
 * Public contract for the `@nuxt4-layers/profile` capability.
 *
 * The only supported cross-layer import path for Profile's types and pure
 * helpers. It imports nothing but `zod`: no Nuxt, Vue, h3, server code,
 * driver, key service or other `@nuxt4-layers/*` package.
 */

// Identifiers and safe names
export {
  correlationIdSchema,
  identifierSchema,
  instantSchema,
  reasonCodeSchema,
  REASON_CODE_PATTERN,
  UUID_PATTERN,
  UUID_V7_PATTERN,
} from '../shared/identifiers'
export type { SafeNameProblem, SafeNameResult } from '../shared/safe-names'
export { checkSafeName, SAFE_NAME_MAX_LENGTH, SAFE_NAME_PROBLEMS, safeNameSchema, scriptsOf } from '../shared/safe-names'

// The record
export type { ProfileAttribute, ProfileAttributes, ProfileChanges } from '../shared/attributes'
export {
  attributeSchemas,
  LOCALE_PATTERN,
  PHONE_NUMBER_PATTERN,
  PROFILE_ATTRIBUTES,
  profileAttributesSchema,
  profileChangesSchema,
  VERIFICATION_CLAIMS,
} from '../shared/attributes'

// Disclosure
export type {
  DepartureAttribution,
  DepartureFacts,
  DisclosureAudience,
  DisclosureContext,
  DisclosureInput,
  DisclosureSettings,
  DisplayName,
  DisplayNameSource,
  LookupPurpose,
  Relationship,
  SubjectStanding,
} from '../shared/disclosure'
export {
  chosenDisplayName,
  DEFAULT_DISCLOSURE_SETTINGS,
  DEPARTURE_ATTRIBUTIONS,
  disclosureContextSchema,
  disclosureSettingsSchema,
  discloseAttributes,
  discloseDisplayName,
  DISCLOSURE_AUDIENCES,
  DISCLOSURE_MAX_SUBJECTS,
  DISPLAY_NAME_SOURCES,
  LOOKUP_PURPOSES,
  RELATIONSHIPS,
  SUBJECT_STANDINGS,
} from '../shared/disclosure'

// Events
export type { ProfileEvent, ProfileEventType } from '../shared/events'
export { IDENTITY_EVENTS_HANDLED, PROFILE_EVENT_PAYLOADS, PROFILE_EVENT_TYPES, profileEventSchema } from '../shared/events'

// HTTP API
export type { ProfileOwnView, ProfilePersonView, ProfileSubject } from '../shared/api'
export {
  disclosureRequestSchema,
  displayNamesRequestSchema,
  PROFILE_API_PREFIX,
  PROFILE_CORRELATION_HEADER,
  PROFILE_LOOKUP_RATE_LIMIT,
  PROFILE_STEP_UP_SECONDS,
  profileSubjectSchema,
  STEP_UP_ATTRIBUTES,
  updateProfileRequestSchema,
} from '../shared/api'

// Errors
export type { ProfileErrorBody, ProfileErrorCode } from '../shared/errors'
export { isProfileErrorCode, PROFILE_ERROR_CODES, PROFILE_ERROR_STATUS, ProfileCompositionError, ProfileFailure } from '../shared/errors'

// Ports
export type {
  DirectoryReadOptions,
  IdentityEventLike,
  PostgresPoolLike,
  ProfileDatabase,
  ProfileDisclosureContextPort,
  ProfileEventPublisher,
  ProfileKeyWrapper,
  ProfileSubjectResolver,
  WrappedProfileKey,
} from '../shared/ports'
