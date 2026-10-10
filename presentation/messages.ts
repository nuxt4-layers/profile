/**
 * The layer's own message catalogue (en-GB). Hosts change wording or add
 * locales in `app.config.ts`: `profile: { messages: { 'en-GB': { ... }, 'cy-GB': { ... } } }`.
 * `{name}` placeholders are replaced from the parameters passed to `t()`.
 */
export const PROFILE_MESSAGES_EN_GB = {
  // Shared
  'profile.common.cancel': 'Cancel',
  'profile.common.save': 'Save',
  'profile.common.signIn': 'Sign in',
  'profile.common.signInAgain': 'Sign in again',
  'profile.common.signInRequired': 'Sign in to see this page.',
  'profile.common.notSet': 'Not set',

  // How a person is named, by the display name's kind
  'profile.person.hidden': 'Member',
  'profile.person.formerMember': 'Former member',
  'profile.person.pseudonym': 'Former member {number}',

  // Errors, by contract code
  'profile.error.unauthenticated': 'Sign in to continue.',
  'profile.error.forbidden': 'This is not available to you.',
  'profile.error.insufficient-assurance': 'For your security, sign in again to confirm it is you, then try again.',
  'profile.error.validation-failed': 'Some of the details are not valid. Check them and try again.',
  'profile.error.conflict': 'Your profile changed somewhere else. It has been reloaded: check it and try again.',
  'profile.error.rate-limited': 'Too many requests. Wait a minute and try again.',
  'profile.error.unavailable': 'Something went wrong. Try again later.',

  // Errors, by the problem behind a validation failure or conflict
  'profile.reason.empty': 'Enter a value, or clear the field to remove it.',
  'profile.reason.too-long': 'This is too long.',
  'profile.reason.forbidden-character': 'This contains a character that is not allowed.',
  'profile.reason.mixed-script': 'Use one writing system.',
  'profile.reason.invalid-locale': 'Enter a language tag, such as en-GB.',
  'profile.reason.invalid-time-zone': 'Choose a time zone from the list.',
  'profile.reason.invalid-email': 'Enter an email address, such as name@example.com.',
  'profile.reason.invalid-phone-number': 'Enter a telephone number in international format, such as +447700900123.',
  'profile.reason.version-changed': 'Your profile changed somewhere else. It has been reloaded: check it and try again.',
  'profile.reason.no-changes': 'There is nothing to save.',

  // Attributes
  'profile.attribute.name': 'Full name',
  'profile.attribute.given_name': 'Given name',
  'profile.attribute.family_name': 'Family name',
  'profile.attribute.preferred_username': 'Nickname',
  'profile.attribute.locale': 'Language',
  'profile.attribute.zoneinfo': 'Time zone',
  'profile.attribute.email': 'Contact email',
  'profile.attribute.phone_number': 'Contact telephone',
  'profile.hint.locale': 'A language tag, such as en-GB or cy-GB.',
  'profile.hint.zoneinfo': 'Used to show times as you expect them.',
  'profile.hint.email': 'Separate from the address you sign in with.',
  'profile.hint.phone_number': 'In international format, such as +447700900123.',
  'profile.zoneinfo.none': 'No time zone',

  // Audiences
  'profile.audience.nobody': 'Only you',
  'profile.audience.group': 'People in your groups',
  'profile.audience.tenant': 'Everyone in your organisation',

  // Own profile
  'profile.own.title': 'Your profile',
  'profile.own.intro': 'You decide what is held about you here, and who may see it.',
  'profile.details.title': 'Your details',
  'profile.details.explained': 'Every detail is optional. Clear a field to remove it.',
  'profile.details.contactNotice': 'Contact details are not verified yet, and nothing is sent to them. Changing one needs a recent sign-in.',
  'profile.details.saved': 'Your details have been saved.',
  'profile.disclosure.title': 'Who can see your details',
  'profile.disclosure.explained': 'Choose who can see each detail. Nobody sees a detail you have not filled in.',
  'profile.disclosure.audiencesLegend': 'Who can see each detail',
  'profile.disclosure.displayNameLegend': 'The name others see',
  'profile.disclosure.displayNameExplained': 'Others see this name only if they can see that detail. Otherwise they see "Member".',
  'profile.disclosure.displayNameSource.name': 'Full name',
  'profile.disclosure.displayNameSource.preferred_username': 'Nickname',
  'profile.disclosure.displayNameSource.given_name': 'Given name',
  'profile.disclosure.departureLegend': 'When you leave a group',
  'profile.disclosure.anonymiseOnDeparture': 'Show me as "Former member" in every group I leave',
  'profile.disclosure.anonymiseOnDepartureHint': 'Otherwise each group decides: your name as it was, "Former member" with a number, or "Former member".',
  'profile.disclosure.saved': 'Your choices have been saved.',
  'profile.export.title': 'Download your data',
  'profile.export.explained': 'A copy of everything this service holds about you in your profile, as a JSON file. It needs a recent sign-in.',
  'profile.export.download': 'Download my profile data',
  'profile.export.ready': 'Your download has started.',
  'profile.export.fileName': 'profile-data.json',

  // Another person's profile
  'profile.person.title': 'Profile',
  'profile.person.notAvailable': 'This profile is not available to you.',
  'profile.person.detailsTitle': 'Details',
  'profile.person.noDetails': 'They have not shared any other details with you.',
  'profile.person.contactNotice': 'Contact details are not verified.',
} as const

export type ProfileMessageKey = keyof typeof PROFILE_MESSAGES_EN_GB
export type ProfileMessages = Partial<Record<ProfileMessageKey, string>>

export function formatMessage(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

/** Resolves a message for a locale: host override, then the en-GB default, then the key itself. */
export function resolveMessage(
  key: string,
  locale: string,
  overrides: Record<string, ProfileMessages | undefined> | undefined,
  params?: Record<string, string | number>,
): string {
  const template = overrides?.[locale]?.[key as ProfileMessageKey]
    ?? (PROFILE_MESSAGES_EN_GB as Record<string, string>)[key]
    ?? key
  return formatMessage(template, params)
}
