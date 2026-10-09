import { profileHandler, requireSubject } from '../../internal/http'
import { ProfileFailure } from '../../../contracts'
import { getOwnProfile } from '../../utils/profile-server'

/** GET /api/profile/me — the person's own record, disclosure settings and version. */
export default profileHandler(async (event) => {
  const subject = await requireSubject(event)
  const own = await getOwnProfile({ subjectId: subject.principalId })
  if (!own) throw new ProfileFailure('forbidden')
  return own
})
