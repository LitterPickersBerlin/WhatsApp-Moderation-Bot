import { WAMessage, WASocket } from '@whiskeysockets/baileys'
import { NUMBERS_TO_NOTIFY, BAN_THRESHOLD, POINTS_PER_MSG, ALERT_GROUPS } from '../config'
import { isAdmin } from '../utils/helpers'
import { checkMessage } from '../utils/classifier'
import { addPoints, resetScore } from '../state'
import { getNetworkPeers } from '../utils/networks'
import { storage } from '../storage'

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

function extractText(msg: WAMessage): string {
  return msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || ''
}


async function checkAndFireSubscriptions(
  sock: WASocket,
  jid: string,
  senderJid: string,
  text: string,
) {
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

      if (msg.message?.reactionMessage) continue

      const text = extractText(msg)
      if (!text.trim()) continue

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

      let matchedKeywords = checkMessage(text)

      // If text alone didn't match, check the subject of any WhatsApp invite links
      if (matchedKeywords.length === 0) {
        const inviteCodes = [...text.matchAll(/https?:\/\/chat\.whatsapp\.com\/([A-Za-z0-9]+)/g)].map(([, c]) => c)
        for (const code of inviteCodes) {
          try {
            const info = await sock.groupGetInviteInfo(code)
            const nameMatches = checkMessage(info.subject ?? '')
            if (nameMatches.length > 0) {
              matchedKeywords = nameMatches
              console.log(`🔗 Invite link group name "${info.subject}" matched keywords: [${nameMatches.join(', ')}]`)
              break
            }
          } catch { /* expired or invalid invite code */ }
        }
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
          await notify(`🛡️ *Admin flagged for spam keywords (no action taken)*\n\n*Group:* ${jid}\n*Admin:* +${senderNumber}\n*Keywords:* ${matchedKeywords.join(', ')}\n*Message:* ${text}`)
        } else {
          await notify(`⚠️ *Spam warning*\n\n*Group:* ${jid}\n*From:* +${senderNumber}\n*Score:* ${member.score} (ban at ${BAN_THRESHOLD})\n*Keywords:* ${matchedKeywords.join(', ')}\n*Message:* ${text}`)
        }
      }
    }
  })
}