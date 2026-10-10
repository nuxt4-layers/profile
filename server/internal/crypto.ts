import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * PRIVATE. Authenticated encryption of a person's attributes with their own
 * data key (AES-256-GCM, a fresh 96-bit nonce per value). The additional
 * authenticated data binds each value to its identity and purpose, so a
 * ciphertext cannot be moved to another person or another column.
 *
 * Sealed layout: nonce (12 bytes) | tag (16 bytes) | ciphertext.
 */

const NONCE_BYTES = 12
const TAG_BYTES = 16
export const DATA_KEY_BYTES = 32

export function newDataKey(): Buffer {
  return randomBytes(DATA_KEY_BYTES)
}

export function seal(key: Uint8Array, plaintext: string, aad: string): Buffer {
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), body])
}

/** Opens a sealed value; throws if it was altered, or sealed for another identity or purpose. */
export function open(key: Uint8Array, sealed: Uint8Array, aad: string): string {
  const buffer = Buffer.from(sealed)
  if (buffer.length < NONCE_BYTES + TAG_BYTES) throw new Error('sealed value too short')
  const decipher = createDecipheriv('aes-256-gcm', key, buffer.subarray(0, NONCE_BYTES))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(buffer.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES))
  return Buffer.concat([decipher.update(buffer.subarray(NONCE_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
}

/** Additional authenticated data for each kind of sealed value. */
export const aad = {
  record: (identityId: string) => `profile:record:v1:${identityId}`,
  departureName: (identityId: string, groupId: string) => `profile:departure-name:v1:${identityId}:${groupId}`,
  wrappedKey: (identityId: string) => `profile:data-key:v1:${identityId}`,
  requestPart: (identityId: string, requestId: string, part: string) => `profile:request-part:v1:${identityId}:${requestId}:${part}`,
}

/** A one-time code of `digits` decimal digits, uniformly random. */
export function newCode(digits: number): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, '0')
}

/**
 * A verification code's digest, keyed with the person's own data key and
 * bound to the identity, the attribute and the value it was sent to: a
 * stored digest says nothing without the key, and a code sent to one value
 * never verifies another.
 */
export function codeDigest(key: Uint8Array, input: { identityId: string, attribute: string, value: string, code: string }): Buffer {
  return createHmac('sha256', key)
    .update(`profile:contact-verification:v1:${input.identityId}:${input.attribute}:${JSON.stringify(input.value)}:${input.code}`)
    .digest()
}

/** Compares two digests in constant time. */
export function sameDigest(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

/** A UUIDv7 (RFC 9562): 48-bit Unix milliseconds, version 7, variant 10, random bits. */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(now, 0, 6)
  bytes[6] = (bytes[6]! & 0x0F) | 0x70
  bytes[8] = (bytes[8]! & 0x3F) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
