import { WASocket } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { DisconnectReason } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import { storage } from '../storage'
import { getAllObserved } from '../utils/networks'

const ALL_OBSERVED = getAllObserved()

export function registerConnectionHandler(
  sock: WASocket,
  startBot: () => void,
) {
  sock.ev.on('connection.update', async ({ qr, connection, lastDisconnect }) => {
    if (qr) qrcode.generate(qr, { small: true })

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
        : true
      console.log('Connection closed. Reconnecting:', shouldReconnect)
      if (shouldReconnect) startBot()
      return
    }

    if (connection === 'open') {
      const botJid = (sock.user?.id ?? '').replace(/:\d+/, '')
      const botLid = (sock.user?.lid ?? '').replace(/:\d+/, '')
      console.log(`✅ Bot connected — JID: ${botJid} | LID: ${botLid}`)
      await syncGroupNames(sock)
    }
  })
}

async function syncGroupNames(sock: WASocket) {
  try {
    const groups = await sock.groupFetchAllParticipating()
    for (const [groupJid, meta] of Object.entries(groups)) {
      if (!ALL_OBSERVED.has(groupJid)) continue
      await storage.upsertGroup(groupJid, meta.subject)
    }
    console.log('✅ Group names synced')
  } catch (err) {
    console.error('❌ Failed to sync group names:', (err as Error).message)
  }
}
