import { disclosureRequestSchema } from '../../../../contracts'
import { correlationOf, profileHandler, readJson, requireSubject } from '../../../internal/http'
import { setProfileDisclosure } from '../../../utils/profile-server'

/** PUT /api/profile/me/disclosure — `{ expectedVersion, settings }`: every attribute's audience, the display name and the departure choice. */
export default profileHandler(async (event) => {
  const subject = await requireSubject(event)
  const body = await readJson(event, disclosureRequestSchema)
  return setProfileDisclosure({ subjectId: subject.principalId, settings: body.settings, expectedVersion: body.expectedVersion, correlationId: correlationOf(event) })
})
