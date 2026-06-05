/**
 * Manually delete a WhatsApp group message by its key components.
 *
 * Usage:
 *   npm run delete-msg -- <groupJid> <messageId> <participantJid>
 *
 * Example:
 *   npm run delete-msg -- "120363408042175763@g.us" "3EB0ABC123" "447700000001@s.whatsapp.net"
 *
 * All three values are included in the ban notification the bot sends to admins.
 * Stop the bot before running this to avoid auth conflicts.
 */

import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import { AUTH_DIR } from '../config'

const [groupJid, messageId, participantJid] = process.argv.slice(2)

if (!groupJid || !messageId || !participantJid) {
  console.error('Usage: npm run delete-msg -- <groupJid> <messageId> <participantJid>')
  console.error('All three values are in the ban notification the bot sends to admins.')
  process.exit(1)
}

async function run(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
    getMessage: async () => undefined,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection }) => {
    if (connection === 'open') {
      console.log('✅ Connected')
      try {
        await sock.sendMessage(groupJid, {
          delete: { remoteJid: groupJid, id: messageId, participant: participantJid },
        })
        console.log('🗑️  Message deleted')
      } catch (err) {
        console.error('❌ Delete failed:', (err as Error).message)
      }
      await new Promise(r => setTimeout(r, 500))
      process.exit(0)
    }

    if (connection === 'close') {
      console.error('❌ Connection closed unexpectedly')
      process.exit(1)
    }
  })
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
