import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

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
