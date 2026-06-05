import * as db from '../db'
import type { StorageAdapter } from './interface'
import type { Subscription, MemberRecord } from '../types'

export class DbAdapter implements StorageAdapter {
  async init() { await db.initDb() }

  upsertSubscription(u: string, g: string, k: string[]) { return db.upsertSubscription(u, g, k) }
  getActiveSubscriptions(g: string)                     { return db.getActiveSubscriptions(g) }
  getActiveSubscriptionsForUser(u: string)              { return db.getActiveSubscriptionsForUser(u) }
  deactivateUserSubscriptions(u: string)                { return db.deactivateUserSubscriptions(u) }

  upsertGroup(g: string, n: string)                     { return db.upsertGroup(g, n) }
  getGroupName(g: string)                               { return db.getGroupName(g) }
  getGroupNames(gs: string[])                           { return db.getGroupNames(gs) }

  getMemberScore(g: string, u: string)                              { return db.getMemberScore(g, u) }
  setMemberScore(g: string, u: string, s: number, m: number)       { return db.setMemberScore(g, u, s, m) }

}
