import { getRouterParam } from 'h3'
import type { VerifiableAttribute } from '../../../../../../contracts'
import { confirmVerificationRequestSchema, ProfileFailure, VERIFIABLE_ATTRIBUTES } from '../../../../../../contracts'
import { correlationOf, profileHandler, readJson, requireSubject } from '../../../../../internal/http'
import { confirmProfileContactVerification } from '../../../../../utils/profile-server'

/**
 * POST /api/profile/me/verification/:attribute/confirm — `{ code }`: the
 * person types back the code; the detail is verified until it changes.
 * A wrong code spends one attempt (`validation-failed`, `wrong-code`); a
 * spent or expired one is `conflict`, `code-expired`.
 */
export default profileHandler(async (event) => {
  const subject = await requireSubject(event)
  const attribute = getRouterParam(event, 'attribute')
  if (!(VERIFIABLE_ATTRIBUTES as readonly (string | undefined)[]).includes(attribute)) throw new ProfileFailure('validation-failed', 'invalid-attribute')
  const body = await readJson(event, confirmVerificationRequestSchema)
  return confirmProfileContactVerification({ subjectId: subject.principalId, attribute: attribute as VerifiableAttribute, code: body.code, correlationId: correlationOf(event) })
})
