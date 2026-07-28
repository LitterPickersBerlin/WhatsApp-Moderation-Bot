/**
 * One-off migration: export database storage to the filesystem adapter's
 * JSON files, for switching STORAGE_MODE from 'database' to 'filesystem'.
 *
 * Usage:
 *   npm run export-fs
 *
 * Reads DATABASE_URL and writes subscriptions.json, groups.json and
 * scores.json into DATA_DIR (default ./data). Stop the bot before running.
 *
 * Only the data the filesystem adapter supports is exported. Activity
 * tracking (users, group_members, group_membership_events, reactions)
 * has no filesystem equivalent and stays in Postgres — take a pg_dump
 * if you want to keep it.
 */

import 'dotenv/config'
import { promises as fs } from 'fs'
import path from 'path'
import { Pool } from 'pg'
import { DATA_DIR } from '../config'

async function run(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  await fs.mkdir(DATA_DIR, { recursive: true })

  const subs = await pool.query<{
    id: number
    user_jid: string
    contact_jid: string | null
    group_jid: string
    keywords: string[]
    expires_at: Date
    active: boolean
  }>(`SELECT id, user_jid, contact_jid, group_jid, keywords, expires_at, active
      FROM keyword_subscriptions`)

  const subscriptions = subs.rows.map(r => ({
    id:         String(r.id),
    userJid:    r.user_jid,               // already hashed in the DB
    contactJid: r.contact_jid ?? '',
    groupJid:   r.group_jid,
    keywords:   r.keywords,
    expiresAt:  r.expires_at.toISOString(),
    active:     r.active,
  }))
  await fs.writeFile(
    path.join(DATA_DIR, 'subscriptions.json'),
    JSON.stringify({ subscriptions }, null, 2),
  )
  console.log(`✅ ${subscriptions.length} subscriptions → subscriptions.json`)

  const groupRows = await pool.query<{ group_jid: string; name: string | null }>(
    `SELECT group_jid, name FROM groups`,
  )
  const groups: Record<string, string> = {}
  for (const r of groupRows.rows) if (r.name) groups[r.group_jid] = r.name
  await fs.writeFile(
    path.join(DATA_DIR, 'groups.json'),
    JSON.stringify({ groups }, null, 2),
  )
  console.log(`✅ ${Object.keys(groups).length} groups → groups.json`)

  const scoreRows = await pool.query<{
    group_jid: string
    user_jid: string
    score: number
    messages: number
  }>(`SELECT group_jid, user_jid, score, messages FROM member_scores`)

  // DB user_jid is already hashed — the key format matches FsAdapter's
  // `${groupJid}:${hashJid(userJid)}` without re-hashing.
  const scores: Record<string, { score: number; messages: number }> = {}
  for (const r of scoreRows.rows) {
    scores[`${r.group_jid}:${r.user_jid}`] = { score: r.score, messages: r.messages }
  }
  await fs.writeFile(
    path.join(DATA_DIR, 'scores.json'),
    JSON.stringify({ scores }, null, 2),
  )
  console.log(`✅ ${Object.keys(scores).length} member scores → scores.json`)

  await pool.end()
  console.log(`\n📁 Export complete: ${path.resolve(DATA_DIR)}`)
  console.log('Set STORAGE_MODE=filesystem in .env and restart the bot.')
}

run().catch(err => {
  console.error('❌ Export failed:', err)
  process.exit(1)
})
