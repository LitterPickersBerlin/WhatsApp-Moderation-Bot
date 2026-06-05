import type { Subscription, MemberRecord } from '../types'

export interface StorageAdapter {
  init(): Promise<void>

  // Subscriptions
  upsertSubscription(userJid: string, groupJid: string, keywords: string[]): Promise<void>
  getActiveSubscriptions(groupJid: string): Promise<Subscription[]>
  getActiveSubscriptionsForUser(userJid: string): Promise<Subscription[]>
  deactivateUserSubscriptions(userJid: string): Promise<Subscription[]>

  // Groups
  upsertGroup(groupJid: string, name: string): Promise<void>
  getGroupName(groupJid: string): Promise<string | null>
  getGroupNames(groupJids: string[]): Promise<Map<string, string>>

  // Spam scores
  getMemberScore(groupJid: string, userJid: string): Promise<MemberRecord>
  setMemberScore(groupJid: string, userJid: string, score: number, messages: number): Promise<void>

}
