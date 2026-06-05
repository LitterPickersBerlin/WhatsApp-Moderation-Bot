import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import { AUTH_DIR } from './config'
import { storage } from './storage'
import { getAllObserved } from './utils/networks'
import { registerConnectionHandler } from './handlers/connection'
import { handleDm, handleDmReaction } from './handlers/dm'
import { registerGroupHandler, handleGroupReaction } from './handlers/group'
import { registerParticipantsHandler } from './handlers/participants'

const silentLogger = pino({ level: 'silent' })
const ALL_OBSERVED = getAllObserved()

export async function startBot(): Promise<void> {
  await storage.init()

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    markOnlineOnConnect: false,
    getMessage: async () => undefined,
    logger: silentLogger,
  })

  sock.ev.on('creds.update', saveCreds)

  const seen = new Set<string>()

  registerConnectionHandler(sock, startBot)

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      const jid = msg.key.remoteJid
      if (!jid?.endsWith('@s.whatsapp.net') && !jid?.endsWith('@lid')) continue
      if (msg.key.fromMe) continue
      await handleDm(sock, msg)
    }
  })

  sock.ev.on('messages.reaction', async (reactions) => {
    for (const { key, reaction } of reactions) {
      if (!reaction.text) continue  // empty = reaction removed

      const groupJid = key.remoteJid
      const isGroupReaction = groupJid?.endsWith('@g.us')

      if (isGroupReaction) {
        // Track activity for group reactions
        if (ALL_OBSERVED.has(groupJid!)) {
          await handleGroupReaction(groupJid!, reaction)
        }
        continue
      }

      // DM reaction — unsubscribe
      if (!key.fromMe) continue
      const lookupJid = reaction.key?.remoteJid
      const replyJid  = (reaction.key as { remoteJidAlt?: string } | null)?.remoteJidAlt ?? lookupJid
      if (!lookupJid || !replyJid) continue
      console.log(`💬 DM reaction from ${replyJid.replace(/@.*/, '')}: ${reaction.text}`)
      await handleDmReaction(sock, lookupJid, replyJid, reaction.text)
    }
  })

  registerGroupHandler(sock, ALL_OBSERVED, seen)
  registerParticipantsHandler(sock)
}