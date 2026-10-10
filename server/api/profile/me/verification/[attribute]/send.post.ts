import { getRouterParam } from 'h3'
import type { VerifiableAttribute } from '../../../../../../contracts'
import { ProfileFailure, VERIFIABLE_ATTRIBUTES } from '../../../../../../contracts'
import { correlationOf, profileHandler, requireRecentSignIn, requireSubject } from '../../../../../internal/http'
import { startProfileContactVerification } from '../../../../../utils/profile-server'

/**
 * POST /api/profile/me/verification/:attribute/send — sends a one-time code
 * to the person's `email` or `phone_number` through the host's notifier.
 * Needs a recent sign-in; rate-limited per detail.
 */
export default profileHandler(async (event) => {
  const subject = await requireSubject(event)
  requireRecentSignIn(subject)
  const attribute = getRouterParam(event, 'attribute')
  if (!(VERIFIABLE_ATTRIBUTES as readonly (string | undefined)[]).includes(attribute)) throw new ProfileFailure('validation-failed', 'invalid-attribute')
  return startProfileContactVerification({ subjectId: subject.principalId, attribute: attribute as VerifiableAttribute, correlationId: correlationOf(event) })
})
