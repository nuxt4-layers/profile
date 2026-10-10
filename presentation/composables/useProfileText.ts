import { useAppConfig, useRuntimeConfig } from '#imports'
import type { DisplayName } from '../../contracts'
import type { ProfileMessages } from '../messages'
import { resolveMessage } from '../messages'

/**
 * PUBLIC. Localised text for the layer's pages and components. Hosts change
 * wording or add locales in app.config.ts under `profile.messages`, and set
 * the locale with `NUXT_PUBLIC_PROFILE_LOCALE`.
 */
export function useProfileText() {
  const locale = useRuntimeConfig().public.profile.locale
  const overrides = (useAppConfig() as { profile?: { messages?: Record<string, ProfileMessages> } }).profile?.messages
  const t = (key: string, params?: Record<string, string | number>) => resolveMessage(key, locale, overrides, params)

  /** A display name in words: the name itself, or the localised fallback for its kind. */
  function nameOf(name: DisplayName): string {
    switch (name.kind) {
      case 'name': return name.value
      case 'pseudonym': return t('profile.person.pseudonym', { number: name.number })
      case 'former-member': return t('profile.person.formerMember')
      default: return t('profile.person.hidden')
    }
  }

  return { locale, t, nameOf }
}
