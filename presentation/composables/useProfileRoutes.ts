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
    signIn: () => routes.signIn,
  }
}
