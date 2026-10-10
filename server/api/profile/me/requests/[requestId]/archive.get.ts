import { setResponseHeader } from 'h3'
import { identifierParam, profileHandler, requireRecentSignIn, requireSubject } from '../../../../../internal/http'
import { getProfileRequestArchive } from '../../../../../utils/profile-server'

/**
 * GET /api/profile/me/requests/:requestId/archive — the archive of the
 * person's completed access request, while it lasts. Needs a recent
 * sign-in; never cached. Anything else is `forbidden`, alike.
 */
export default profileHandler(async (event) => {
  const subject = await requireSubject(event)
  requireRecentSignIn(subject)
  const requestId = identifierParam(event, 'requestId')
  const archive = await getProfileRequestArchive({ subjectId: subject.principalId, requestId })
  setResponseHeader(event, 'cache-control', 'no-store')
  return archive
})
