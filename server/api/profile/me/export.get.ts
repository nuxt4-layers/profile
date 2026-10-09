import { setResponseHeader } from 'h3'
import { ProfileFailure } from '../../../../contracts'
import { profileHandler, requireRecentSignIn, requireSubject } from '../../../internal/http'
import { exportProfileData } from '../../../utils/profile-server'

/** GET /api/profile/me/export — Profile's part of the person's data export. Needs a recent sign-in; never cached. */
export default profileHandler(async (event) => {
  const subject = await requireSubject(event)
  requireRecentSignIn(subject)
  const exported = await exportProfileData({ subjectId: subject.principalId })
  if (!exported) throw new ProfileFailure('forbidden')
  setResponseHeader(event, 'cache-control', 'no-store')
  return exported
})
