import { z } from 'zod'

/**
 * Contact-detail verification (docs/contracts.md §15). Profile sends a
 * one-time code to a contact detail through the host's notification port,
 * and records the detail verified once the person types the code back. The
 * code is kept only as a keyed digest bound to the value, and verification
 * lapses whenever the value changes. Profile sends nothing else to it.
 */

export const VERIFIABLE_ATTRIBUTES = ['email', 'phone_number'] as const
export type VerifiableAttribute = typeof VERIFIABLE_ATTRIBUTES[number]

/** How a code reaches each detail; the host's notifier delivers it. */
export const VERIFICATION_CHANNELS: Readonly<Record<VerifiableAttribute, 'email' | 'sms'>> = Object.freeze({
  email: 'email',
  phone_number: 'sms',
})

export const PROFILE_VERIFICATION_POLICY = Object.freeze({
  /** Digits in a code. */
  codeDigits: 6,
  /** A code lasts this long. */
  codeSeconds: 600,
  /** Wrong codes allowed before the code is spent. */
  attempts: 5,
  /** Codes sent per person and detail in `sendWindowSeconds`. */
  sends: 5,
  sendWindowSeconds: 3600,
})

export const verificationCodeSchema = z.string().regex(/^[0-9]{6}$/, 'invalid-code')

/** `POST /api/profile/me/verification/:attribute/confirm` */
export const confirmVerificationRequestSchema = z.strictObject({ code: verificationCodeSchema })
