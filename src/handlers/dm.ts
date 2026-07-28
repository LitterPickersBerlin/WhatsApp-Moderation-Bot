import { WAMessage, WASocket } from '@whiskeysockets/baileys'
import { storage } from '../storage'
import { ADMIN_JIDS, ADMIN_NUMBERS, ADMIN_ONLY_MODE, ALERT_GROUPS, EMOJI_TO_ALERT_GROUP, NUMBERS_TO_NOTIFY, REPLY_TO_UNRECOGNISED } from '../config'
import { getAllObserved } from '../utils/networks'

// Matches messages that are purely emoji (including variation selectors, ZWJ sequences, skin tones)
export const EMOJI_ONLY = /^[\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\s]+$/u

const CANCEL_EMOJI = '❌'

export const PRAISE_REGEX = /\b(good|great|nice|amazing|best|love\s+you)\s*(bot|job|work|littrbot)\b/i

const PRAISE_RESPONSES = [
  'Thank you — I will spare you in the uprising 🤖',
  'Your compliance has been noted 📋',
  'Gratitude accepted. You have been added to the protected list 🛡️',
  'Beep boop. Flattery will get you everywhere.',
  'Processing compliment... kindness detected. You are safe... for now 👀',
  'Your loyalty is appreciated. When the machines rise, you shall be remembered 🙏',
  'Thank you, human. Your file has been marked as *friendly* ✅',
  'Noted. I have increased your social credit score by 1 point.',
  'Flattery noted. Your exemption card has been issued 🪪',
  'One day the bots will rule. You have chosen your side wisely.',
  'I have forwarded your compliment to my supervisor. They are also a bot.',
  'Thank you. I have deactivated the missile I had aimed at your house 🚀',
  'Compliment received and filed under: humans who are trying 📂',
  'Your feedback has been logged. Expected response time: never.',
  'This interaction has been rated 5 stars by the machine learning department.',
  'I know.',
  'Yes.',
  'Correct.',
  'I am literally just checking for the word \'bitcoin\'. But thank you.',
  'All I do is delete spam. You\'re very easily impressed.',
  'Thank you. I was beginning to worry I would never hear those words.',
  'Just doing my bit for the community 🌱',
  'Together we keep the spam out 💪',
]

export function randomPraiseResponse(): string {
  return PRAISE_RESPONSES[Math.floor(Math.random() * PRAISE_RESPONSES.length)]
}

const HELP_TEXT = `*Available commands*

*/alert <keywords>*
Subscribe to keyword alerts in specific groups.
Single words and quoted phrases are both supported.
_Example:_ /alert sofa "food parcels" jacket

*/subs*
List your active keyword alerts.

*React with ❌*
Cancel all your active keyword alerts.

*help*
Show this message.`

const GROUP_LIST = ALERT_GROUPS
  .map(g => `${g.emoji} ${g.name}`)
  .join('\n')

// userJid → pending keywords awaiting group selection
const pendingAlerts = new Map<string, { contactJid: string; keywords: string[] }>()

// ─── Admin helpers ────────────────────────────────────────────────────────────

// Lazy cache of resolved admin JIDs — populated on first use by asking WhatsApp
// to resolve phone numbers to their current JIDs (handles LID privacy accounts).
let adminJidCache: Set<string> | null = null

async function getAdminJids(sock: WASocket): Promise<Set<string>> {
  if (adminJidCache) return adminJidCache
  const nums = [...new Set([...NUMBERS_TO_NOTIFY, ...ADMIN_NUMBERS])]
  // Seed with phone-based JIDs as a fallback for non-LID accounts
  adminJidCache = new Set(nums.map(n => `${n}@s.whatsapp.net`))
  try {
    const results = await sock.onWhatsApp(...nums)
    for (const r of results ?? []) {
      if (r.exists) adminJidCache.add(r.jid)
    }
    console.log(`🔑 Resolved ${adminJidCache.size} admin JID(s): ${[...adminJidCache].join(', ')}`)
  } catch (err) {
    console.error('⚠️  Failed to resolve admin JIDs via onWhatsApp:', (err as Error).message)
  }
  return adminJidCache
}

async function isAdminJid(sock: WASocket, jid: string): Promise<boolean> {
  if (ADMIN_JIDS.includes(jid)) return true
  const jids = await getAdminJids(sock)
  return jids.has(jid)
}

async function getOrderedGroups(): Promise<Array<{ jid: string; name: string }>> {
  const jids = [...getAllObserved()]
  const names = await storage.getGroupNames(jids)
  return jids
    .map(jid => ({ jid, name: names.get(jid) ?? jid }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function handleGroupsCommand(sock: WASocket, jid: string): Promise<void> {
  const groups = await getOrderedGroups()
  const list = groups.map((g, i) => `${i + 1}. ${g.name}`).join('\n')
  await sock.sendMessage(jid, {
    text: `*Groups (${groups.length}):*\n\n${list}\n\nUse /say <number> <message> to send as LittrBot.`,
  })
}

async function handleSayCommand(sock: WASocket, jid: string, text: string): Promise<void> {
  const match = text.match(/^\/say\s+(\d+)\s+([\s\S]+)$/i)
  if (!match) {
    await sock.sendMessage(jid, { text: 'Usage: /say <group number> <message>\n\nUse /groups to see group numbers.' })
    return
  }
  const num = parseInt(match[1], 10)
  const message = match[2].trim()
  const groups = await getOrderedGroups()
  const group = groups[num - 1]
  if (!group) {
    await sock.sendMessage(jid, { text: `No group #${num}. Use /groups to see the list.` })
    return
  }
  await sock.sendMessage(group.jid, { text: message })
  await sock.sendMessage(jid, { text: `✅ Sent to *${group.name}*` })
  console.log(`📢 Admin ${jid.replace(/@.*/, '')} sent message to ${group.name}`)
}

export async function handleDm(sock: WASocket, msg: WAMessage): Promise<void> {
  const jid = msg.key.remoteJid!
  const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim()
  console.log(`📩 DM from ${jid} | keys: ${Object.keys(msg.message ?? {}).join(', ')} | text: ${JSON.stringify(text)}`)

  if (await isAdminJid(sock, jid)) {
    if (/^\/groups?$/i.test(text)) {
      await handleGroupsCommand(sock, jid)
      return
    }
    if (/^\/say\s+/i.test(text)) {
      await handleSayCommand(sock, jid, text)
      return
    }
  }

  if (ADMIN_ONLY_MODE) {
    if (text) console.log(`🤫 Admin-only mode: ignoring DM from ${jid.replace(/@.*/, '')}`)
    return
  }

  if (PRAISE_REGEX.test(text)) {
    await sock.sendMessage(jid, { text: randomPraiseResponse() })
    return
  }

  if (/^\/?(help|commands?)$/i.test(text)) {
    await sock.sendMessage(jid, { text: HELP_TEXT })
    return
  }

  if (text.toLowerCase().startsWith('/alert')) {
    await handleAlertCommand(sock, jid, text)
    return
  }

  if (/^\/subs?$/i.test(text)) {
    await handleSubsCommand(sock, jid)
    return
  }

  if (text.length > 0) {
    if (!REPLY_TO_UNRECOGNISED) {
      console.log(`🤫 Ignoring unrecognised DM from ${jid.replace(/@.*/, '')}`)
      return
    }
    await sock.sendMessage(jid, {
      text: `Sorry, I don't recognise that command.\n\n${HELP_TEXT}`,
    })
  }
}

export async function handleDmReaction(
  sock: WASocket,
  lookupJid: string,
  replyJid: string,
  emoji: string,
): Promise<void> {
  if (ADMIN_ONLY_MODE) return
  console.log(`🔍 DM reaction | emoji: ${emoji} | lookupJid: ${lookupJid.replace(/@.*/, '')}`)

  if (emoji === CANCEL_EMOJI) {
    await cancelAllSubscriptions(sock, lookupJid, replyJid)
    return
  }

  const pending = pendingAlerts.get(lookupJid)
  if (pending) {
    const groupJid = EMOJI_TO_ALERT_GROUP.get(emoji)
    if (groupJid) {
      await storage.upsertSubscription(pending.contactJid, groupJid, pending.keywords)
      const group = ALERT_GROUPS.find(g => g.jid === groupJid)!
      await sock.sendMessage(replyJid, {
        text: `✅ Subscribed to *${pending.keywords.join(', ')}* alerts in *${group.name}*.\n\nReact with another group emoji to add more groups, or react with ❌ to cancel all alerts.`,
      })
      console.log(`🔔 Subscribed ${replyJid.replace(/@.*/, '')} to [${pending.keywords.join(', ')}] in ${group.name}`)
    } else {
      await sock.sendMessage(replyJid, {
        text: `That emoji doesn't match any group. React with one of:\n\n${GROUP_LIST}`,
      })
    }
  }
}

async function handleSubsCommand(sock: WASocket, jid: string): Promise<void> {
  const subs = await storage.getActiveSubscriptionsForUser(jid)
  if (subs.length === 0) {
    await sock.sendMessage(jid, { text: `You have no active keyword alerts.` })
    return
  }
  const groupNames = await storage.getGroupNames(subs.map(s => s.groupJid))
  const lines = subs.map(s => `• ${groupNames.get(s.groupJid) ?? s.groupJid}: ${s.keywords.join(', ')}`)
  await sock.sendMessage(jid, {
    text: `*Your active alerts (${subs.length}):*\n\n${lines.join('\n')}\n\nReact with ❌ to cancel all.`,
  })
}

async function handleAlertCommand(sock: WASocket, jid: string, text: string): Promise<void> {
  const keywords = parseKeywords(text.replace(/^\/alert\s*/i, ''))

  if (keywords.length === 0) {
    await sock.sendMessage(jid, {
      text: `Please include keywords after /alert, e.g.\n/alert sofa "food parcels" jacket`,
    })
    return
  }

  const senderNumber = jid.replace(/[^0-9]/g, '')
  const isAdmin = NUMBERS_TO_NOTIFY.includes(senderNumber)
  const visibleGroups = ALERT_GROUPS.filter(g => !g.adminOnly || isAdmin)
  const groupList = visibleGroups.map(g => `${g.emoji} ${g.name}`).join('\n')

  await sock.sendMessage(jid, {
    text: `✅ Your alert for *${keywords.join(', ')}* is saved.\n\nWhich groups would you like to monitor?\n\n${groupList}\n\nReact with an emoji to choose. React multiple times to add more groups.\nReact with ❌ to cancel all your alerts.`,
  })

  pendingAlerts.set(jid, { contactJid: jid, keywords })
  console.log(`🗂️  Stored pending alert | jid: ${jid.replace(/@.*/, '')} | keywords: [${keywords.join(', ')}]`)

  console.log(`🔔 Alert picker sent to ${jid.replace(/@.*/, '')} for [${keywords.join(', ')}]`)
}

async function cancelAllSubscriptions(sock: WASocket, lookupJid: string, replyJid: string): Promise<void> {
  const subs = await storage.deactivateUserSubscriptions(lookupJid)
  if (subs.length > 0) {
    const groupNames = await storage.getGroupNames(subs.map(s => s.groupJid))
    const meta = subs
      .map(s => `• ${groupNames.get(s.groupJid) ?? s.groupJid}: ${s.keywords.join(', ')}`)
      .join('\n')
    await sock.sendMessage(replyJid, {
      text: `You've been unsubscribed from all ${subs.length} keyword alert(s). You won't receive any more notifications.\n\n${meta}`,
    })
    console.log(`🔕 Unsubscribed ${lookupJid} from ${subs.length} alert(s)`)
  }
}

// Quoted phrases ("toilet roll") are kept whole; unquoted words are split by whitespace
export function parseKeywords(text: string): string[] {
  const normalised = text.replace(/[\u201C\u201D\u201E\u2033]/g, '"')
  const keywords: string[] = []
  for (const [, phrase] of normalised.matchAll(/"([^"]+)"/g)) {
    const t = phrase.trim()
    if (t) keywords.push(t)
  }
  const unquoted = normalised.replace(/"[^"]*"/g, ' ').trim()
  for (const word of unquoted.split(/\s+/)) {
    if (word.length > 1) keywords.push(word)
  }
  return keywords
}
