import { STEP_UP_ATTRIBUTES, updateProfileRequestSchema } from '../../../contracts'
import { correlationOf, profileHandler, readJson, requireRecentSignIn, requireSubject } from '../../internal/http'
import { updateProfile } from '../../utils/profile-server'

/**
 * PATCH /api/profile/me — `{ expectedVersion, changes }`: a value sets an
 * attribute, `null` removes it. Changing a contact detail needs a recent
 * sign-in. `conflict` if the record changed since `expectedVersion`.
 */
export default profileHandler(async (event) => {
  const subject = await requireSubject(event)
  const body = await readJson(event, updateProfileRequestSchema)
  if (STEP_UP_ATTRIBUTES.some(key => key in body.changes)) requireRecentSignIn(subject)
  return updateProfile({ subjectId: subject.principalId, changes: body.changes, expectedVersion: body.expectedVersion, correlationId: correlationOf(event) })
})
