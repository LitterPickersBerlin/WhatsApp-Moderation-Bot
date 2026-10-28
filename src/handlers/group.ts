import { WAMessage, WASocket } from '@whiskeysockets/baileys'
import { NUMBERS_TO_NOTIFY, BAN_THRESHOLD, POINTS_PER_MSG, ALERT_GROUPS, LOG_MESSAGES, ADMIN_ONLY_MODE } from '../config'
import { PRAISE_REGEX, randomPraiseResponse } from './dm'
import { isAdmin } from '../utils/helpers'
import { checkMessage } from '../utils/classifier'
import { addPoints, resetScore } from '../state'
import { getNetworkPeers } from '../utils/networks'
import { extractNativeInvite, findWhatsappLinks, resolveForeignLinks, unwrapMessageContent } from '../utils/whatsappLinks'
import { storage } from '../storage'

// ─── Last bot action timestamp (per group) ───────────────────────────────────

const lastBotActionAt = new Map<string, number>()

function recordBotAction(groupJid: string) {
  lastBotActionAt.set(groupJid, Date.now())
}

const BOT_ACTION_WINDOW_MS = 5 * 60 * 1000

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Parses subscription keywords from a message. Quoted phrases ("toilet roll") are
// kept as-is for exact-phrase matching; unquoted words are split by whitespace.
export function parseKeywords(text: string): string[] {
  const stripped = text.replace(/@\S+/g, '').replace(/[\u201C\u201D\u201E\u2033]/g, '"')
  const keywords: string[] = []

  // Extract quoted phrases first
  const quoted = stripped.matchAll(/"([^"]+)"/g)
  for (const [, phrase] of quoted) {
    const trimmed = phrase.trim()
    if (trimmed) keywords.push(trimmed)
  }

  // Split remaining (non-quoted) text by whitespace
  const unquoted = stripped.replace(/"[^"]*"/g, ' ').trim()
  for (const word of unquoted.split(/\s+/)) {
    if (word.length > 1) keywords.push(word)
  }

  return keywords
}

function makeNotifier(sock: WASocket) {
  return (text: string) =>
    Promise.all(
      NUMBERS_TO_NOTIFY.map(n => sock.sendMessage(`${n}@s.whatsapp.net`, { text }))
    )
}

export function extractText(msg: WAMessage): string {
  // Unwrap ephemeral / view-once / edited wrappers so their contents are seen
  const m = unwrapMessageContent(msg.message)
  return m?.conversation
    || m?.extendedTextMessage?.text
    || m?.imageMessage?.caption
    || m?.videoMessage?.caption
    || m?.documentMessage?.caption
    || m?.groupInviteMessage?.caption
    || ''
}


async function checkAndFireSubscriptions(
  sock: WASocket,
  jid: string,
  senderJid: string,
  text: string,
) {
  if (ADMIN_ONLY_MODE) return
  const subscriptions = await storage.getActiveSubscriptions(jid)
  for (const sub of subscriptions) {
    if (sub.contactJid === senderJid) continue
    const matched = checkMessage(text, sub.keywords)
    if (matched.length > 0) {
      const groupName = await storage.getGroupName(jid)
      const inviteLink = ALERT_GROUPS.find(g => g.jid === jid)?.inviteLink
      const groupLine = inviteLink
        ? `*Group:* ${groupName ?? 'this group'} — ${inviteLink}`
        : `*Group:* ${groupName ?? 'this group'}`
      await sock.sendMessage(sub.contactJid, {
        text: `🔔 *Keyword alert*\n\n${groupLine}\n*Keyword(s):* ${matched.join(', ')}\n*Message:* ${text}\n\nReact with ❌ to cancel all alerts.`,
      })
    }
  }
}

// ─── Spam handling ────────────────────────────────────────────────────────────

async function handleSpamBan(
  sock: WASocket,
  msg: WAMessage,
  jid: string,
  senderJid: string,
  senderNumber: string,
  matchedKeywords: string[],
  score: number,
  notify: (text: string) => Promise<unknown[]>,
) {
  await new Promise(r => setTimeout(r, 1000))

  try {
    await sock.sendMessage(jid, { delete: msg.key })
    console.log(`🗑️  Deleted message from ${senderNumber}`)
  } catch (err) {
    console.error('❌ Delete failed:', (err as Error).message)
  }

  // Retry delete for clients that received the message late.
  // Fire-and-forget so the kick proceeds immediately.
  const msgKey = msg.key
  for (const retryMs of [3000, 8000, 15000, 30000, 60000]) {
    setTimeout(() => {
      sock.sendMessage(jid, { delete: msgKey }).catch(() => {})
    }, retryMs)
  }

  try {
    await sock.groupParticipantsUpdate(jid, [senderJid], 'remove')
    console.log(`🔨 Removed ${senderNumber} from group`)
  } catch (err) {
    console.error('❌ Remove failed:', (err as Error).message)
  }

  const otherLinked = getNetworkPeers(jid)
  let linkedRemoved = 0
  for (const linkedJid of otherLinked) {
    await new Promise(r => setTimeout(r, 1500))
    try {
      await sock.groupParticipantsUpdate(linkedJid, [senderJid], 'remove')
      console.log(`🔨 Removed ${senderNumber} from linked group ${linkedJid}`)
      linkedRemoved++
    } catch (err) {
      const reason = (err as Error).message
      if (reason === 'bad-request') {
        console.log(`ℹ️  ${senderNumber} not in linked group ${linkedJid}, skipping`)
      } else {
        console.error(`❌ Remove from linked group ${linkedJid} failed: ${reason}`)
      }
    }
  }

  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
  await notify(
    `🔨 *User removed for spam*\n\n*Group:* ${jid}\n*User:* +${senderNumber}\n*Score reached:* ${score}\n*Keywords:* ${matchedKeywords.join(', ')}\n*Message:* ${text}` +
    (linkedRemoved > 0 ? `\n*Also removed from:* ${linkedRemoved} linked group(s)` : '') +
    `\n\n_To manually delete: \`${jid}\` \`${msg.key.id}\` \`${senderJid}\`_`
  )

  recordBotAction(jid)
  await resetScore(jid, senderJid)
}

// ─── Group reaction handler (called from messages.reaction event) ────────────

export function handleGroupReaction(
  groupJid: string,
  reaction: { key?: { id?: string | null } | null; text?: string | null },
): void {
  const reactionKey = reaction.key as { remoteJid?: string; participant?: string } | null
  const senderJid = reactionKey?.participant ?? reactionKey?.remoteJid
  if (!senderJid || !reaction.text) return
  console.log(`👍 Reaction from +${senderJid.replace(/[^0-9]/g, '')} in ${groupJid}: ${reaction.text}`)
}

// ─── Main group message handler ───────────────────────────────────────────────

export function registerGroupHandler(
  sock: WASocket,
  allObserved: Set<string>,
  seen: Set<string>,
) {
  const notify = makeNotifier(sock)

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      const msgId = msg.key.id
      if (!msgId || seen.has(msgId)) continue
      seen.add(msgId)
      if (seen.size > 1000) seen.delete(seen.values().next().value!)

      if (msg.key.fromMe) continue

      const jid = msg.key.remoteJid
      if (!jid) continue

      // DM messages are handled separately
      if (jid.endsWith('@s.whatsapp.net')) continue

      if (!jid.endsWith('@g.us')) continue

      console.log(`📨 Group message | group: ${jid} | observed: ${allObserved.has(jid)} | type: ${Object.keys(msg.message ?? {}).join(', ')}`)

      if (!allObserved.has(jid)) {
        console.log(`⏭️  Ignored — group not in GROUP_NETWORKS: ${jid}`)
        continue
      }

      const senderJid = msg.key.participant || msg.participant
      if (!senderJid) continue
      const senderNumber = senderJid.replace(/[^0-9]/g, '')

      if (msg.message?.reactionMessage) {
        if (LOG_MESSAGES) console.log(`⏭️  Skipped reaction from +${senderNumber}`)
        continue
      }

      const text = extractText(msg)
      const nativeInvite = extractNativeInvite(msg.message)
      if (!text.trim() && !nativeInvite) {
        if (LOG_MESSAGES) console.log(`⏭️  Skipped — no text extracted | type: ${Object.keys(msg.message ?? {}).join(', ')} | from: +${senderNumber}`)
        continue
      }
      if (LOG_MESSAGES) console.log(`💬 Message text: "${text}" | from: +${senderNumber}`)

      if (PRAISE_REGEX.test(text)) {
        const lastAction = lastBotActionAt.get(jid)
        if (!ADMIN_ONLY_MODE && lastAction && Date.now() - lastAction < BOT_ACTION_WINDOW_MS) {
          await sock.sendMessage(jid, { text: randomPraiseResponse() }, { quoted: msg })
        }
        continue
      }

      const senderIsAdmin = isAdmin(senderNumber)

      // ── Fire keyword subscription alerts ─────────────────────────────────
      try {
        await checkAndFireSubscriptions(sock, jid, senderJid, text)
      } catch (err) {
        console.error('❌ Subscription check failed:', (err as Error).message)
      }

      // ── Spam check ────────────────────────────────────────────────────────
      if (senderIsAdmin) {
        const member = await addPoints(jid, senderJid, POINTS_PER_MSG, senderNumber)
        console.log(`🛡️  Admin ${senderNumber} → score: ${member.score}`)
        continue
      }

      const matchedKeywords = checkMessage(text)

      // ── WhatsApp link detection ────────────────────────────────────────────
      // Flags every WhatsApp link format — group invites (incl. native invite
      // cards), channels, wa.me / api.whatsapp.com click-to-chat, call links,
      // wa.link shorteners and whatsapp:// deeplinks. Links into the bot's own
      // GROUP_NETWORKS (e.g. the alertGroups invite links) are allowed.
      try {
        const linkHits = findWhatsappLinks(text)
        if (nativeInvite) linkHits.push(nativeInvite)
        if (linkHits.length > 0) {
          const foreign = await resolveForeignLinks(linkHits, code => sock.groupGetInviteInfo(code))
          for (const hit of foreign) {
            matchedKeywords.push(hit.label)
            // Preserve the old behaviour of also scoring spam keywords found
            // in the target group's name ("Crypto Signals" etc.)
            for (const kw of checkMessage(hit.groupName ?? '')) {
              if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw)
            }
            console.log(`🔗 WhatsApp link flagged (${hit.kind}): ${hit.raw}`)
          }
        }
      } catch (err) {
        console.error('❌ WhatsApp link check failed:', (err as Error).message)
      }

      if (matchedKeywords.length === 0) {
        const member = await addPoints(jid, senderJid, POINTS_PER_MSG, senderNumber)
        console.log(`✅ +1 for ${senderNumber} → score: ${member.score} (${member.messages} msgs)`)
      } else {
        const deduction = matchedKeywords.length
        const member = await addPoints(jid, senderJid, -deduction, senderNumber)
        console.log(`⚠️  ${senderNumber} matched [${matchedKeywords.join(', ')}] → -${deduction} pts → score: ${member.score}`)

        if (member.score <= BAN_THRESHOLD) {
          await handleSpamBan(sock, msg, jid, senderJid, senderNumber, matchedKeywords, member.score, notify)
        } else if (senderIsAdmin) {
          recordBotAction(jid)
          await notify(`🛡️ *Admin flagged for spam keywords (no action taken)*\n\n*Group:* ${jid}\n*Admin:* +${senderNumber}\n*Keywords:* ${matchedKeywords.join(', ')}\n*Message:* ${text}`)
        } else {
          recordBotAction(jid)
          await notify(`⚠️ *Spam warning*\n\n*Group:* ${jid}\n*From:* +${senderNumber}\n*Score:* ${member.score} (ban at ${BAN_THRESHOLD})\n*Keywords:* ${matchedKeywords.join(', ')}\n*Message:* ${text}`)
        }
      }
    }
  })
}