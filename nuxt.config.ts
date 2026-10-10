/**
 * Nuxt layer entry point for `@nuxt4-layers/profile`.
 *
 * Hosts compose this layer by package name from `extends` and supply the
 * required ports from a Nitro plugin. See docs/composition-contract.md.
 */
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2026-06-30',

  // Presentation (default pages and components), registered only when
  // `profile.presentation` is true. The core below never depends on it.
  modules: [fileURLToPath(new URL('./modules/presentation', import.meta.url))],

  runtimeConfig: {
    profile: {
      /**
       * The host's public origin (`NUXT_PROFILE_BASE_URL`). State-changing
       * `/api/profile/*` requests must come from it; without it they are all
       * refused.
       */
      baseUrl: '',
    },
    public: {
      profile: {
        /** BCP 47 locale of the pages' text (`NUXT_PUBLIC_PROFILE_LOCALE`). */
        locale: 'en-GB',
        /**
         * Where the pages link. The presentation module fills in its own page
         * paths (empty while the pages are off); hosts set `signIn`.
         */
        routes: {
          signIn: '/sign-in',
          profile: '',
          person: '',
        },
      },
    },
  },
})
