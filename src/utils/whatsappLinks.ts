import { ALERT_GROUPS } from '../config'
import { getAllObserved } from './networks'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WhatsappLinkKind =
  | 'group-invite'   // chat.whatsapp.com/<code> (incl. legacy /invite/<code>)
  | 'native-invite'  // a groupInviteMessage card — carries no text link at all
  | 'channel'        // whatsapp.com/channel/<code>
  | 'chat-link'      // wa.me/… or api.whatsapp.com/… (click-to-chat)
  | 'call-link'      // call.whatsapp.com/voice|video/<code>
  | 'shortener'      // wa.link/<slug> — third-party WhatsApp link shortener
  | 'deeplink'       // whatsapp://…

export type WhatsappLinkHit = {
  kind: WhatsappLinkKind
  /** Fed into the spam pipeline and admin notifications, like a matched keyword. */
  label: string
  /** The matched text (or a description, for native invite cards). */
  raw: string
  /** Invite code, for group invites. */
  inviteCode?: string
  /** Target group JID, when known without resolving (native invite cards). */
  groupJid?: string
  /** Target group name, when known up front or once resolved. */
  groupName?: string
}

// ─── Detection ────────────────────────────────────────────────────────────────

// Invisible/formatting characters spammers insert to break links apart.
const INVISIBLES =
  /[­͏؜᠋-᠎​-‏‪-‮⁠-⁯︀-️﻿]/g

/** Undo common link obfuscation: zero-width chars, "(dot)", spaced-out dots. */
export function normalizeForLinkScan(text: string): string {
  return text
    .normalize('NFKC')
    .replace(INVISIBLES, '')
    .replace(/\s*[([{]\s*dot\s*[)\]}]\s*/gi, '.')
    .replace(/(\w)\s+dot\s+(\w)/gi, '$1.$2')
    .replace(/\s*\.\s*/g, '.')
}

type Pattern = { kind: WhatsappLinkKind; label: string; re: RegExp }

// Invite codes are ~22 alphanumeric characters; requiring 16+ stops the
// de-obfuscated scan from matching an ordinary word after a collapsed
// "… chat. whatsapp. com/" in prose. The lookbehinds on the short domains
// (wa.me, wa.link) stop lookalikes such as "sawa.me" from matching.
const PATTERNS: Pattern[] = [
  {
    kind: 'group-invite',
    label: 'whatsapp-invite-link',
    re: /(?:https?:\/\/)?(?:www\.)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{16,})/gi,
  },
  {
    kind: 'channel',
    label: 'whatsapp-channel-link',
    re: /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9]{10,})/gi,
  },
  {
    kind: 'chat-link',
    label: 'whatsapp-chat-link',
    re: /(?:https?:\/\/)?(?:(?<![a-zA-Z0-9.-])wa\.me|(?:www\.)?api\.whatsapp\.com)\/[^\s]+/gi,
  },
  {
    kind: 'call-link',
    label: 'whatsapp-call-link',
    re: /(?:https?:\/\/)?(?:www\.)?call\.whatsapp\.com\/(?:voice|video)\/[A-Za-z0-9-]+/gi,
  },
  {
    kind: 'shortener',
    label: 'wa.link-shortener',
    re: /(?:https?:\/\/)?(?<![a-zA-Z0-9.-])wa\.link\/[A-Za-z0-9-]+/gi,
  },
  {
    kind: 'deeplink',
    label: 'whatsapp-deeplink',
    re: /whatsapp:\/\/[^\s]+/gi,
  },
]

function trimTrailingPunct(s: string): string {
  return s.replace(/[.,!?;:)\]'"]+$/, '')
}

/** Finds WhatsApp links of any format in a piece of text. */
export function findWhatsappLinks(text: string): WhatsappLinkHit[] {
  if (!text) return []
  const hits = new Map<string, WhatsappLinkHit>()

  // Scan the raw text first (preserves invite-code casing for resolution),
  // then a de-obfuscated copy to catch broken-up links.
  for (const source of [text, normalizeForLinkScan(text)]) {
    for (const { kind, label, re } of PATTERNS) {
      for (const m of source.matchAll(re)) {
        const raw = trimTrailingPunct(m[0])
        const code = m[1]
        const key = `${kind}:${(code ?? raw).toLowerCase()}`
        if (!hits.has(key)) {
          hits.set(key, {
            kind,
            label,
            raw,
            inviteCode: kind === 'group-invite' ? code : undefined,
          })
        }
      }
    }
  }

  return [...hits.values()]
}

/** Message shape we need — structurally compatible with Baileys' proto.IMessage. */
type MessageContent = {
  groupInviteMessage?: {
    inviteCode?: string | null
    groupJid?: string | null
    groupName?: string | null
  } | null
} | null | undefined

// Wrapper message types whose real content sits one level down. Mirrors
// Baileys' normalizeMessageContent — reimplemented locally because a value
// import of Baileys (ESM-only since v7) breaks Jest's CommonJS runtime,
// while type-only imports are erased at compile time.
const WRAPPER_KEYS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
  'editedMessage',
] as const

/** Unwraps ephemeral / view-once / edited / document-with-caption wrappers. */
export function unwrapMessageContent<T>(content: T): T {
  let m: any = content
  for (let i = 0; i < 5 && m; i++) {
    const wrapper = WRAPPER_KEYS.map(k => m[k]).find(Boolean)
    if (!wrapper?.message) break
    m = wrapper.message
  }
  return m
}

/** Detects WhatsApp's native "invite to group" card, wherever it is wrapped. */
export function extractNativeInvite(message: MessageContent): WhatsappLinkHit | null {
  const inv = unwrapMessageContent(message)?.groupInviteMessage
  if (!inv) return null
  return {
    kind: 'native-invite',
    label: 'whatsapp-invite-card',
    raw: `invite card → ${inv.groupName || inv.groupJid || 'unknown group'}`,
    inviteCode: inv.inviteCode || undefined,
    groupJid: inv.groupJid || undefined,
    groupName: inv.groupName || undefined,
  }
}

// ─── Network allowlist ────────────────────────────────────────────────────────

function inviteCodeFromLink(link: string): string | null {
  const m = /chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]+)/i.exec(link)
  return m ? m[1] : null
}

/** Invite codes of the network's own groups, from alertGroups in bot.config.json. */
export const OWN_INVITE_CODES: ReadonlySet<string> = new Set(
  ALERT_GROUPS
    .map(g => (g.inviteLink ? inviteCodeFromLink(g.inviteLink) : null))
    .filter((c): c is string => c !== null),
)

/** JIDs of every group in GROUP_NETWORKS. */
export const NETWORK_JIDS: ReadonlySet<string> = getAllObserved()

export type InviteInfoLookup = (code: string) => Promise<{ id: string; subject?: string | null }>

const inviteCache = new Map<string, { network: boolean; subject?: string }>()
const INVITE_CACHE_MAX = 500

/** Test hook. */
export function clearInviteCache(): void {
  inviteCache.clear()
}

/**
 * Drops hits that point into the bot's own group network (legitimate sharing)
 * and finalises the labels of the rest. Unknown invite codes are resolved via
 * `lookup` (sock.groupGetInviteInfo in production) to learn the target group;
 * resolutions are cached so repeated spam blasts cost one API call per code.
 */
export async function resolveForeignLinks(
  hits: WhatsappLinkHit[],
  lookup: InviteInfoLookup,
  ownCodes: ReadonlySet<string> = OWN_INVITE_CODES,
  networkJids: ReadonlySet<string> = NETWORK_JIDS,
): Promise<WhatsappLinkHit[]> {
  const foreign: WhatsappLinkHit[] = []

  for (const hit of hits) {
    if (hit.kind === 'group-invite' || hit.kind === 'native-invite') {
      // The invite code is what actually grants entry, so allowlisting goes by
      // the code (or the group it resolves to) — never by a card's
      // self-declared groupJid/groupName, which can be spoofed.
      if (hit.inviteCode) {
        if (ownCodes.has(hit.inviteCode)) continue
        let info = inviteCache.get(hit.inviteCode)
        if (!info) {
          try {
            const res = await lookup(hit.inviteCode)
            info = { network: networkJids.has(res.id), subject: res.subject ?? undefined }
          } catch {
            info = { network: false } // expired or invalid — still link-shaped
          }
          if (inviteCache.size >= INVITE_CACHE_MAX) inviteCache.clear()
          inviteCache.set(hit.inviteCode, info)
        }
        if (info.network) continue
        if (info.subject) hit.groupName = info.subject
      } else if (hit.groupJid && networkJids.has(hit.groupJid)) {
        // A card with no code can't be joined through; skip it when it points
        // at one of our own groups.
        continue
      }

      hit.label = hit.groupName
        ? `${hit.label} ("${hit.groupName}")`
        : `${hit.label} (unresolved)`
    }

    foreign.push(hit)
  }

  return foreign
}
