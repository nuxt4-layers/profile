import type { ProfileErrorBody } from '../../contracts'
import { isProfileErrorCode } from '../../contracts'
import { useProfileText } from './useProfileText'

/** The contract error a failed request carried, if any. */
export function profileErrorOf(error: unknown): ProfileErrorBody | null {
  const body = (error as { data?: { data?: unknown } } | null)?.data?.data as Partial<ProfileErrorBody> | undefined
  if (body && isProfileErrorCode(body.code)) return { code: body.code, messageKey: `profile.error.${body.code}`, ...(body.reason ? { reason: body.reason } : {}) }
  return null
}

/**
 * PUBLIC. Shared state for an action on the layer's pages: a pending flag,
 * the error to show and the code behind it. `disabled` is also true until
 * the component has hydrated, so a form never submits natively.
 */
export function useProfileAction() {
  const { t } = useProfileText()
  const pending = ref(false)
  const hydrated = ref(false)
  onMounted(() => { hydrated.value = true })
  const disabled = computed(() => pending.value || !hydrated.value)
  const error = ref<string | null>(null)
  const code = ref<ProfileErrorBody['code'] | null>(null)

  /**
   * A message for a contract error: the wording of each problem the server
   * named, when there is any, otherwise the code's.
   */
  function messageFor(body: ProfileErrorBody | null): string {
    if (!body) return t('profile.error.unavailable')
    if (body.reason) {
      const specific = body.reason.split(',').map(reason => t(`profile.reason.${reason}`)).filter(text => !text.startsWith('profile.reason.'))
      if (specific.length > 0) return [...new Set(specific)].join(' ')
    }
    return t(`profile.error.${body.code}`)
  }

  /** Runs an action, tracking pending state; on failure sets `error` and returns null. */
  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    pending.value = true
    error.value = null
    code.value = null
    try {
      return await action()
    }
    catch (failure) {
      const body = profileErrorOf(failure)
      code.value = body?.code ?? 'unavailable'
      error.value = messageFor(body)
      return null
    }
    finally {
      pending.value = false
    }
  }

  return { pending, disabled, error, code, run, messageFor, t }
}
