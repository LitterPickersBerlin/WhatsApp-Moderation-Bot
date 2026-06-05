import { WASocket } from '@whiskeysockets/baileys'
import { getAllObserved } from '../utils/networks'

const ALL_OBSERVED = getAllObserved()

export function registerParticipantsHandler(sock: WASocket) {
  sock.ev.on('group-participants.update', ({ id: groupJid, participants, action }) => {
    if (!ALL_OBSERVED.has(groupJid)) return

    for (const participant of participants) {
      const userJid = typeof participant === 'string' ? participant : participant.id
      const phone = userJid.replace(/[^0-9]/g, '')
      logParticipantAction(groupJid, phone, action)
    }
  })
}

function logParticipantAction(groupJid: string, phone: string, action: string) {
  switch (action) {
    case 'add':     console.log(`➕ ${phone} joined ${groupJid}`); break
    case 'remove':  console.log(`➖ ${phone} removed from ${groupJid}`); break
    case 'promote': console.log(`⬆️  ${phone} promoted in ${groupJid}`); break
    case 'demote':  console.log(`⬇️  ${phone} demoted in ${groupJid}`); break
  }
}
