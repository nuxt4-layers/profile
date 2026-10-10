import { setResponseStatus } from 'h3'
import { personRequestSchema } from '../../../../../contracts'
import { correlationOf, profileHandler, readJson, requireRecentSignIn, requireSubject } from '../../../../internal/http'
import { openProfileRequest } from '../../../../utils/profile-server'

/**
 * POST /api/profile/me/requests — `{ type }`: the person opens an access or
 * a restriction request. Needs a recent sign-in. Erasure is account closure;
 * there is no erasure here.
 */
export default profileHandler(async (event) => {
  const subject = await requireSubject(event)
  requireRecentSignIn(subject)
  const body = await readJson(event, personRequestSchema)
  const request = await openProfileRequest({ subjectId: subject.principalId, type: body.type, origin: 'person', correlationId: correlationOf(event) })
  setResponseStatus(event, 201)
  return request
})
