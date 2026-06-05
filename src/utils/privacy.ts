import { createHash } from 'crypto'

/** One-way hash of a JID. Consistent across calls — safe to use as a DB key. */
export function hashJid(jid: string): string {
  return createHash('sha256').update(jid.toLowerCase().trim()).digest('hex')
}

/** Country code prefix from a raw phone number (e.g. '4917612345678' → '49'). */
export function phonePrefix(phone: string): string | null {
  if (!phone) return null
  const digits = phone.replace(/[^0-9]/g, '')
  if (digits.length < 4) return null
  // Keep only country code — strip the 9+ digit local number
  return digits.slice(0, Math.max(1, digits.length - 9))
}
