/**
 * Failure categories at Profile's boundary (docs/contracts.md §7).
 *
 * `forbidden` is deliberately coarse: it never says whether a person or a
 * record exists, or which rule refused.
 */
export const PROFILE_ERROR_CODES = [
  'unauthenticated',
  'forbidden',
  'validation-failed',
  'unavailable',
] as const

export type ProfileErrorCode = typeof PROFILE_ERROR_CODES[number]

/** HTTP status used when an error code crosses the HTTP boundary. */
export const PROFILE_ERROR_STATUS: Readonly<Record<ProfileErrorCode, number>> = {
  'unauthenticated': 401,
  'forbidden': 403,
  'validation-failed': 400,
  'unavailable': 503,
}

export function isProfileErrorCode(value: unknown): value is ProfileErrorCode {
  return typeof value === 'string' && (PROFILE_ERROR_CODES as readonly string[]).includes(value)
}

/** Raised when the host has not supplied a required port. Profile fails closed: no implicit store or key. */
export class ProfileCompositionError extends Error {
  readonly port: string

  constructor(port: string) {
    super(`Profile port '${port}' has not been supplied by the host application. See docs/composition-contract.md.`)
    this.name = 'ProfileCompositionError'
    this.port = port
  }
}

/**
 * A server function's failure, carrying a contract code. `unavailable` means
 * the database, the key port or Identity's port failed, and the operation
 * failed closed. The detail is for server logs only and never names a value.
 */
export class ProfileFailure extends Error {
  readonly code: ProfileErrorCode

  constructor(code: ProfileErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'ProfileFailure'
    this.code = code
  }
}
