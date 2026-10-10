import { useRuntimeConfig } from '#imports'

/**
 * PUBLIC. Links to the layer's pages, and to the host's sign-in page, from
 * the paths the presentation module was given. A page that is turned off
 * has no link: its function returns null.
 */
export function useProfileRoutes() {
  const routes = useRuntimeConfig().public.profile.routes
  const fill = (path: string, params: Record<string, string>) =>
    path.replace(/:(\w+)/g, (match, name: string) => (name in params ? encodeURIComponent(params[name]!) : match))
  return {
    profile: () => routes.profile || null,
    person: (subjectId: string, groupId: string | null = null) => {
      if (!routes.person) return null
      const path = fill(routes.person, { subjectId })
      return groupId ? `${path}?groupId=${encodeURIComponent(groupId)}` : path
    },
    departures: () => routes.departures || null,
    requests: () => routes.requests || null,
    signIn: () => routes.signIn,
    /** The host's page to close the account (`NUXT_PUBLIC_PROFILE_ROUTES_CLOSE_ACCOUNT`), where having one's data deleted begins; null when unset. */
    closeAccount: () => routes.closeAccount || null,
  }
}
