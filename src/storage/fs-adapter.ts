import { promises as fs } from 'fs'
import path from 'path'
import { DATA_DIR } from '../config'
import { hashJid } from '../utils/privacy'
import type { StorageAdapter } from './interface'
import type { Subscription, MemberRecord } from '../types'

interface StoredSub {
  id:         string
  userJid:    string  // hashed
  contactJid: string  // raw — used to send messages
  groupJid:   string
  keywords:   string[]
  expiresAt:  string  // ISO 8601
  active:     boolean
}

export class FsAdapter implements StorageAdapter {
  private subsPath   = path.join(DATA_DIR, 'subscriptions.json')
  private groupsPath = path.join(DATA_DIR, 'groups.json')
  private scoresPath = path.join(DATA_DIR, 'scores.json')
  private scores     = new Map<string, MemberRecord>()

  async init() {
    await fs.mkdir(DATA_DIR, { recursive: true })
    await this.ensureFile(this.subsPath,   JSON.stringify({ subscriptions: [] }, null, 2))
    await this.ensureFile(this.groupsPath, JSON.stringify({ groups: {} }, null, 2))
    await this.ensureFile(this.scoresPath, JSON.stringify({ scores: {} }, null, 2))
    const raw = await fs.readFile(this.scoresPath, 'utf-8')
    const stored = JSON.parse(raw).scores as Record<string, MemberRecord>
    for (const [key, record] of Object.entries(stored)) {
      this.scores.set(key, record)
    }
    console.log(`📁 Filesystem storage initialised at ${path.resolve(DATA_DIR)}`)
  }

  private async ensureFile(filePath: string, defaultContent: string) {
    try { await fs.access(filePath) }
    catch { await fs.writeFile(filePath, defaultContent) }
  }

  private async readSubs(): Promise<StoredSub[]> {
    const raw = await fs.readFile(this.subsPath, 'utf-8')
    return JSON.parse(raw).subscriptions as StoredSub[]
  }

  private async writeSubs(subs: StoredSub[]) {
    await fs.writeFile(this.subsPath, JSON.stringify({ subscriptions: subs }, null, 2))
  }

  private async readGroups(): Promise<Record<string, string>> {
    const raw = await fs.readFile(this.groupsPath, 'utf-8')
    return JSON.parse(raw).groups as Record<string, string>
  }

  private async writeGroups(groups: Record<string, string>) {
    await fs.writeFile(this.groupsPath, JSON.stringify({ groups }, null, 2))
  }

  async upsertSubscription(userJid: string, groupJid: string, keywords: string[]) {
    const subs      = await this.readSubs()
    const hashed    = hashJid(userJid)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const sortedKw  = [...keywords].sort().join('|')

    const existing = subs.find(s =>
      s.userJid === hashed && s.groupJid === groupJid &&
      [...s.keywords].sort().join('|') === sortedKw,
    )

    if (existing) {
      existing.contactJid = userJid
      existing.expiresAt  = expiresAt
      existing.active     = true
    } else {
      subs.push({
        id: Math.random().toString(36).slice(2, 10),
        userJid: hashed, contactJid: userJid,
        groupJid, keywords, expiresAt, active: true,
      })
    }
    await this.writeSubs(subs)
  }

  async getActiveSubscriptions(groupJid: string): Promise<Subscription[]> {
    const now  = new Date()
    const subs = await this.readSubs()
    return subs
      .filter(s => s.groupJid === groupJid && s.active && new Date(s.expiresAt) > now)
      .map(s => ({ userJid: s.userJid, contactJid: s.contactJid, groupJid: s.groupJid, keywords: s.keywords }))
  }

  async getActiveSubscriptionsForUser(userJid: string): Promise<Subscription[]> {
    const now    = new Date()
    const hashed = hashJid(userJid)
    const subs   = await this.readSubs()
    return subs
      .filter(s => s.userJid === hashed && s.active && new Date(s.expiresAt) > now)
      .map(s => ({ userJid: s.userJid, contactJid: s.contactJid, groupJid: s.groupJid, keywords: s.keywords }))
  }

  async deactivateUserSubscriptions(userJid: string): Promise<Subscription[]> {
    const now    = new Date()
    const hashed = hashJid(userJid)
    const subs   = await this.readSubs()
    const active = subs.filter(s => s.userJid === hashed && s.active && new Date(s.expiresAt) > now)
    active.forEach(s => { s.active = false })
    await this.writeSubs(subs)
    return active.map(s => ({ userJid: s.userJid, contactJid: s.contactJid, groupJid: s.groupJid, keywords: s.keywords }))
  }

  async upsertGroup(groupJid: string, name: string) {
    const groups = await this.readGroups()
    groups[groupJid] = name
    await this.writeGroups(groups)
  }

  async getGroupName(groupJid: string): Promise<string | null> {
    const groups = await this.readGroups()
    return groups[groupJid] ?? null
  }

  async getGroupNames(groupJids: string[]): Promise<Map<string, string>> {
    const groups = await this.readGroups()
    return new Map(groupJids.filter(j => groups[j]).map(j => [j, groups[j]]))
  }

  async getMemberScore(groupJid: string, userJid: string): Promise<MemberRecord> {
    return this.scores.get(`${groupJid}:${hashJid(userJid)}`) ?? { score: 0, messages: 0 }
  }

  async setMemberScore(groupJid: string, userJid: string, score: number, messages: number) {
    this.scores.set(`${groupJid}:${hashJid(userJid)}`, { score, messages })
    const obj: Record<string, MemberRecord> = {}
    for (const [key, record] of this.scores) obj[key] = record
    await fs.writeFile(this.scoresPath, JSON.stringify({ scores: obj }, null, 2))
  }

}
