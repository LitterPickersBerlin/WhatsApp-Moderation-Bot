import { POINTS_MAX, TRUSTED_COUNTRY_CODES } from './config'
import { storage } from './storage'
import type { MemberRecord } from './types'

export type { MemberRecord }

/** Pure helper — applies a score delta and message count increment.
 *  Exported so it can be unit-tested without a DB connection. */
export function applyDelta(member: MemberRecord, delta: number, max: number = POINTS_MAX): MemberRecord {
  return {
    score:    Math.min(max, member.score + delta),
    messages: delta > 0 ? member.messages + 1 : member.messages,
  }
}

export async function addPoints(groupJid: string, userJid: string, delta: number, senderNumber?: string): Promise<MemberRecord> {
  let current = await storage.getMemberScore(groupJid, userJid)
  if (current.messages === 0 && senderNumber && TRUSTED_COUNTRY_CODES.some(c => senderNumber.startsWith(c))) {
    current = { score: 1, messages: 0 }
  }
  const updated = applyDelta(current, delta)
  await storage.setMemberScore(groupJid, userJid, updated.score, updated.messages)
  return updated
}

export async function resetScore(groupJid: string, userJid: string): Promise<void> {
  const current = await storage.getMemberScore(groupJid, userJid)
  await storage.setMemberScore(groupJid, userJid, 0, current.messages)
}
