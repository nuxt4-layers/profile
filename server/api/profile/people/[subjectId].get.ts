import { getQuery } from 'h3'
import { ProfileFailure, UUID_V7_PATTERN } from '../../../../contracts'
import { identifierParam, profileHandler, requireSubject } from '../../../internal/http'
import { consumeProfileLookup, viewProfile } from '../../../utils/profile-server'

/**
 * GET /api/profile/people/:subjectId?groupId= — one person's profile as the
 * signed-in viewer may see it now. Rate-limited per viewer; never says
 * whether the person exists.
 */
export default profileHandler(async (event) => {
  const subject = await requireSubject(event)
  const subjectId = identifierParam(event, 'subjectId')
  const query = getQuery(event)
  const groupId = query.groupId === undefined ? null : String(query.groupId)
  if (groupId !== null && !UUID_V7_PATTERN.test(groupId)) throw new ProfileFailure('validation-failed')
  await consumeProfileLookup({ viewerId: subject.principalId })
  return viewProfile({ viewerId: subject.principalId, subjectId, groupId })
})
