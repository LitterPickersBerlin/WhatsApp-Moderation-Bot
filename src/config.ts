// ─── Storage ──────────────────────────────────────────────────────────────────

/** 'database' requires DATABASE_URL. 'filesystem' uses local JSON files — no
 *  no activity tracking; alerting and spam removal only. */
export const STORAGE_MODE = (process.env.STORAGE_MODE ?? 'filesystem') as 'database' | 'filesystem'

/** Directory for filesystem storage. Only used when STORAGE_MODE=filesystem. */
export const DATA_DIR = process.env.DATA_DIR ?? './data'

// ─── Bot ──────────────────────────────────────────────────────────────────────

export const BOT_NAME  = process.env.BOT_NAME  ?? 'WhatsApp Moderator'
export const AUTH_DIR  = process.env.AUTH_DIR  ?? './auth'

/** Phone numbers (no +, no spaces) that receive spam/ban notifications. */
export const NUMBERS_TO_NOTIFY: string[] = (process.env.NUMBERS_TO_NOTIFY ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)

/** Phone numbers that are exempt from spam scoring. */
export const ADMIN_NUMBERS: string[] = (process.env.ADMIN_NUMBERS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)

// ─── Spam scoring ─────────────────────────────────────────────────────────────

/** Score at or below which a user is removed from all groups in the network. */
export const BAN_THRESHOLD = Number(process.env.BAN_THRESHOLD ?? -1)

/** Points awarded per clean message. */
export const POINTS_PER_MSG = Number(process.env.POINTS_PER_MSG ?? 1)

/** Maximum score a user can accumulate. */
export const POINTS_MAX = Number(process.env.POINTS_MAX ?? 100)

// Phone number prefixes (no +) whose users start with 1 bonus point.
// Rewards members from expected local communities and gives them slightly
// more leeway before a spam ban triggers.
export const TRUSTED_COUNTRY_CODES: string[] = ['49']

// ─── Bot config (groups, networks, spam keywords) ─────────────────────────────
// Copy bot.config.example.json → bot.config.json and edit to suit your
// community. The path can be overridden with the BOT_CONFIG env variable.

import fs from 'fs'
import path from 'path'

export type AlertGroup = {
  jid:         string
  name:        string
  emoji:       string
  inviteLink?: string
  adminOnly?:  boolean
}

type BotConfig = {
  spamKeywords:  string[]
  alertGroups:   AlertGroup[]
  groupNetworks: Record<string, string[]>
}

const botConfigPath = path.resolve(process.env.BOT_CONFIG ?? 'bot.config.json')

let botConfig: BotConfig
try {
  botConfig = JSON.parse(fs.readFileSync(botConfigPath, 'utf8')) as BotConfig
} catch {
  throw new Error(
    `Missing bot config: ${botConfigPath}\n` +
    `Copy bot.config.example.json → bot.config.json and fill it in.`
  )
}

export const SPAM_KEYWORDS: string[]                   = botConfig.spamKeywords
export const ALERT_GROUPS:  AlertGroup[]               = botConfig.alertGroups
export const GROUP_NETWORKS: Record<string, string[]>  = botConfig.groupNetworks

export const EMOJI_TO_ALERT_GROUP = new Map<string, string>(
  ALERT_GROUPS.map(g => [g.emoji, g.jid])
)
