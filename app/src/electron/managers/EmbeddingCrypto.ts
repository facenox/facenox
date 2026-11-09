import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

function deriveKey(orgKey: string): Buffer {
  const key = Buffer.from(orgKey, "base64")
  if (key.length !== 32) {
    throw new Error(`Invalid encryption key length: expected 32 bytes, got ${key.length}.`)
  }
  return key
}

export function encryptEmbedding(raw: Uint8Array, orgKey: string): string {
  const key = deriveKey(orgKey)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(Buffer.from(raw)), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`
}

export function decryptEmbedding(encoded: string, orgKey: string): Uint8Array {
  if (!encoded || typeof encoded !== "string") {
    throw new Error("Invalid encrypted embedding format: payload must be a non-empty string.")
  }
  const parts = encoded.split(".")
  if (parts.length !== 3) {
    throw new Error(`Invalid encrypted embedding format: expected 3 parts, got ${parts.length}.`)
  }
  const [ivB64, tagB64, dataB64] = parts
  const key = deriveKey(orgKey)
  const iv = Buffer.from(ivB64, "base64")
  const tag = Buffer.from(tagB64, "base64")
  const encrypted = Buffer.from(dataB64, "base64")

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return new Uint8Array(Buffer.concat([decipher.update(encrypted), decipher.final()]))
}
