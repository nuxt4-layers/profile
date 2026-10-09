import { correlationOf, identifierParam, profileHandler, requireSubject } from '../../../../../internal/http'
import { anonymiseProfileDeparture } from '../../../../../utils/profile-server'

/** POST /api/profile/me/departures/:groupId/anonymise — be shown as "Former member" in a group one left. */
export default profileHandler(async (event) => {
  const subject = await requireSubject(event)
  const groupId = identifierParam(event, 'groupId')
  await anonymiseProfileDeparture({ subjectId: subject.principalId, groupId, correlationId: correlationOf(event) })
  return { groupId, status: 'anonymised' as const }
})
