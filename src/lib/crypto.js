/**
 * BookEase Field-Level Encryption — AES-256-GCM
 *
 * Uses the browser's built-in Web Crypto API (no extra package).
 * A 256-bit key is derived from VITE_ENCRYPTION_SECRET via PBKDF2
 * (100,000 iterations, SHA-256) so the raw secret never becomes the key.
 *
 * Encrypted output format:  base64(iv):base64(ciphertext)
 * Both halves are URL-safe base64 so the result is safe to store in TEXT columns.
 */

const ALGO      = 'AES-GCM'
const KEY_LEN   = 256          // bits
const IV_LEN    = 12           // bytes  (96-bit IV for AES-GCM)
const PBKDF2_ITERATIONS = 100_000
const SALT      = 'bookease-field-encryption-v1'   // static salt — key rotation changes this string

// ── Key derivation (cached per session) ──────────────────────────────────────

let _cachedKey = null

async function getDerivedKey() {
  if (_cachedKey) return _cachedKey

  const secret = import.meta.env.VITE_ENCRYPTION_SECRET
  if (!secret) {
    throw new Error(
      '[crypto] VITE_ENCRYPTION_SECRET is not set. ' +
      'Add it to your .env file and Vercel environment variables.'
    )
  }

  const enc     = new TextEncoder()
  const rawKey  = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  _cachedKey = await crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt:       enc.encode(SALT),
      iterations: PBKDF2_ITERATIONS,
      hash:       'SHA-256',
    },
    rawKey,
    { name: ALGO, length: KEY_LEN },
    false,           // not extractable
    ['encrypt', 'decrypt'],
  )

  return _cachedKey
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function fromBase64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string.
 * Returns a string in the format  "base64iv:base64ciphertext"
 * that is safe to store in a TEXT database column.
 *
 * Returns null if plaintext is null/undefined/empty.
 */
export async function encryptField(plaintext) {
  if (plaintext == null || plaintext === '') return null

  const key = await getDerivedKey()
  const iv  = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const enc = new TextEncoder()

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    enc.encode(String(plaintext)),
  )

  return `${toBase64(iv)}:${toBase64(ciphertext)}`
}

/**
 * Decrypt a field that was encrypted with encryptField().
 * Returns the original plaintext string, or null if the input is null/empty.
 *
 * Throws if the value is malformed or the key is wrong.
 */
export async function decryptField(encrypted) {
  if (encrypted == null || encrypted === '') return null

  // Handle legacy plain-text values (e.g. old rows before encryption was added).
  // If the value doesn't contain ':' it was never encrypted — return as-is.
  if (!encrypted.includes(':')) return encrypted

  const [ivB64, ctB64] = encrypted.split(':')
  const key        = await getDerivedKey()
  const iv         = fromBase64(ivB64)
  const ciphertext = fromBase64(ctB64)

  const plainBuf = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    key,
    ciphertext,
  )

  return new TextDecoder().decode(plainBuf)
}

/**
 * Bulk-decrypt an array of appointment objects in place.
 * Mutates each object's customer_phone field.
 * Safe to call even if some rows were not encrypted (legacy).
 */
export async function decryptAppointments(appointments) {
  return Promise.all(
    appointments.map(async (apt) => {
      if (!apt.customer_phone) return apt
      try {
        const phone = await decryptField(apt.customer_phone)
        return { ...apt, customer_phone: phone }
      } catch {
        // If decryption fails, leave the raw value rather than crashing the UI.
        return apt
      }
    }),
  )
}
