import { setResponseHeader } from 'h3'
import { profileHandler, requireSubject } from '../../../../internal/http'
import { listProfileRequests } from '../../../../utils/profile-server'

/** GET /api/profile/me/requests — the person's data-subject requests and each part's progress, newest first. */
export default profileHandler(async (event) => {
  const subject = await requireSubject(event)
  setResponseHeader(event, 'cache-control', 'no-store')
  return { requests: await listProfileRequests({ subjectId: subject.principalId }) }
})
