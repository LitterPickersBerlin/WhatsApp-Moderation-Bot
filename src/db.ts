import { Pool } from 'pg'
import { hashJid } from './utils/privacy'
import type { Subscription, MemberRecord } from './types'

export type { Subscription, MemberRecord }

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export async function initDb(retries = 10, delayMs = 5000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS keyword_subscriptions (
          id          SERIAL PRIMARY KEY,
          user_jid    TEXT        NOT NULL,
          group_jid   TEXT        NOT NULL,
          keywords    TEXT[]      NOT NULL,
          expires_at  TIMESTAMPTZ NOT NULL,
          active      BOOLEAN     NOT NULL DEFAULT TRUE,
          UNIQUE (user_jid, group_jid)
        )
      `);
      console.log('✅ Database initialised');
      return;
    } catch (err: any) {
      if (err.code === '57P03') {
        console.log(`⏳ Database starting up, retrying in ${delayMs / 1000}s... (${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
  throw new Error(`❌ Database did not become ready after ${retries} attempts`);
}


export async function upsertSubscription(
  userJid: string,
  groupJid: string,
  keywords: string[],
): Promise<void> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await pool.query(
    `INSERT INTO keyword_subscriptions (user_jid, contact_jid, group_jid, keywords, expires_at, active)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     ON CONFLICT (user_jid, group_jid, keywords) DO UPDATE
       SET contact_jid = $2, expires_at = $5, active = TRUE`,
    [hashJid(userJid), userJid, groupJid, keywords, expiresAt],
  )
}

export async function getActiveSubscriptions(groupJid: string): Promise<Subscription[]> {
  const { rows } = await pool.query<{ user_jid: string; contact_jid: string; group_jid: string; keywords: string[] }>(
    `SELECT user_jid, contact_jid, group_jid, keywords
     FROM keyword_subscriptions
     WHERE group_jid = $1 AND active = TRUE AND expires_at > NOW()`,
    [groupJid],
  )
  return rows.map(r => ({ userJid: r.user_jid, contactJid: r.contact_jid, groupJid: r.group_jid, keywords: r.keywords }))
}

export async function getActiveSubscriptionsForUser(userJid: string): Promise<Subscription[]> {
  const { rows } = await pool.query<{ user_jid: string; contact_jid: string; group_jid: string; keywords: string[] }>(
    `SELECT user_jid, contact_jid, group_jid, keywords
     FROM keyword_subscriptions
     WHERE user_jid = $1 AND active = TRUE AND expires_at > NOW()`,
    [hashJid(userJid)],
  )
  return rows.map(r => ({ userJid: r.user_jid, contactJid: r.contact_jid, groupJid: r.group_jid, keywords: r.keywords }))
}

/** Returns the subscriptions that were deactivated. */
export async function deactivateUserSubscriptions(userJid: string): Promise<Subscription[]> {
  const subs = await getActiveSubscriptionsForUser(userJid)
  if (subs.length > 0) {
    await pool.query(
      `UPDATE keyword_subscriptions SET active = FALSE
       WHERE user_jid = $1 AND active = TRUE`,
      [hashJid(userJid)],
    )
  }
  return subs
}

/** Deactivates a single subscription for a specific group. Returns it if found, null otherwise. */
export async function deactivateSingleSubscription(userJid: string, groupJid: string): Promise<Subscription | null> {
  const { rows } = await pool.query<{ user_jid: string; contact_jid: string; group_jid: string; keywords: string[] }>(
    `UPDATE keyword_subscriptions SET active = FALSE
     WHERE user_jid = $1 AND group_jid = $2 AND active = TRUE
     RETURNING user_jid, contact_jid, group_jid, keywords`,
    [hashJid(userJid), groupJid],
  )
  if (!rows[0]) return null
  return { userJid: rows[0].user_jid, contactJid: rows[0].contact_jid, groupJid: rows[0].group_jid, keywords: rows[0].keywords }
}

// ─── Member scores ────────────────────────────────────────────────────────────



export async function getMemberScore(groupJid: string, userJid: string): Promise<MemberRecord> {
  const { rows } = await pool.query<{ score: number; messages: number }>(
    `SELECT score, messages FROM member_scores WHERE group_jid = $1 AND user_jid = $2`,
    [groupJid, hashJid(userJid)],
  )
  return rows[0] ?? { score: 0, messages: 0 }
}

export async function setMemberScore(
  groupJid: string,
  userJid:  string,
  score:    number,
  messages: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO member_scores (group_jid, user_jid, score, messages, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (group_jid, user_jid) DO UPDATE
       SET score = $3, messages = $4, updated_at = NOW()`,
    [groupJid, hashJid(userJid), score, messages],
  )
}


// ─── Groups ───────────────────────────────────────────────────────────────────

export async function getGroupName(groupJid: string): Promise<string | null> {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT name FROM groups WHERE group_jid = $1`,
    [groupJid],
  )
  return rows[0]?.name ?? null
}

export async function getGroupNames(groupJids: string[]): Promise<Map<string, string>> {
  if (groupJids.length === 0) return new Map()
  const { rows } = await pool.query<{ group_jid: string; name: string }>(
    `SELECT group_jid, name FROM groups WHERE group_jid = ANY($1)`,
    [groupJids],
  )
  return new Map(rows.map(r => [r.group_jid, r.name]))
}

export async function upsertGroup(groupJid: string, name: string): Promise<void> {
  await pool.query(
    `INSERT INTO groups (group_jid, name, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (group_jid) DO UPDATE
       SET name = $2, updated_at = NOW()`,
    [groupJid, name],
  )
}


