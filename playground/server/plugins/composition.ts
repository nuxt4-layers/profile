/**
 * Playground composition root: supplies Profile's ports the way a host would.
 * The key wrapper uses a fixed development master key and the disclosure
 * context answers `self` only: stand-ins for the host's KMS and for
 * Identity's port. Neither is fit for production.
 */
export default defineNitroPlugin(() => {
  provideProfileKeyWrapper(createLocalProfileKeyWrapper({
    keys: { 'dev-1': Buffer.alloc(32, 7).toString('base64') },
    current: 'dev-1',
  }))
  // No sign-in in the playground: every `/api/profile/*` request is unauthenticated.
  provideProfileSubjectResolver({ resolve: async () => null })
  provideProfileDisclosureContext({
    async describe(request) {
      return {
        viewerId: request.viewerId,
        groupId: null,
        departurePolicy: null,
        subjects: request.subjectIds.map(subjectId => ({
          subjectId,
          relationship: subjectId === request.viewerId ? 'self' as const : 'none' as const,
          standing: 'visible' as const,
        })),
        readAt: new Date().toISOString(),
      }
    },
  })
})
