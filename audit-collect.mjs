#!/usr/bin/env node
/**
 * audit-collect.mjs — one-off member + avatar collector for a WhatsApp group.
 * Nothing here touches the bot's code or data; it just borrows its session.
 *
 * !! STOP THE BOT FIRST — AND ITS FILE WATCHER !!
 *     pm2 stop WhatsappMod --watch
 * Two sockets on the same auth state fight each other (conflict / "replaced",
 * status 440) and can get the session logged out. ecosystem.config.js sets
 * watch: true, and a plain `pm2 stop` leaves the watcher armed — any file
 * written under the repo root would restart the bot mid-run. So stop with
 * --watch, keep OUT_DIR outside the repo, run this to completion, then
 * `pm2 start ecosystem.config.js` again.
 *
 * Run from the bot's repo root so its node_modules resolve:
 *     GROUP="Litter Pickers" OUT_DIR="$HOME/audit-out" node audit-collect.mjs
 *
 * Env:
 *   GROUP          group JID (...@g.us) or a case-insensitive substring of
 *                  the group subject (required)
 *   AUTH_DIR       Baileys auth folder; auto-detects common names if unset
 *   OUT_DIR        output directory (default ./audit-out)
 *   MIN_DELAY_MS   avatar drip pacing, lower bound (default 6000)
 *   MAX_DELAY_MS   avatar drip pacing, upper bound (default 18000)
 *
 * Output:
 *   OUT_DIR/participants.json   group metadata + one row per member
 *   OUT_DIR/avatars/<id>.jpg    full-size avatar where visible
 *
 * Re-running skips avatars already on disk, so an interrupted run resumes.
 */

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

// The package has shipped under two names; try both.
async function loadBaileys() {
  for (const name of ['baileys', '@whiskeysockets/baileys']) {
    try { return await import(name) } catch { /* next */ }
  }
  throw new Error('could not import baileys — run this from the bot repo root')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const jitter = (min, max) => min + Math.floor(Math.random() * (max - min))
const safe = (jid) => jid.replace(/[^a-zA-Z0-9]/g, '_')

const GROUP = process.env.GROUP
if (!GROUP) {
  console.error('Set GROUP to the group JID or a substring of its subject.')
  process.exit(1)
}
const OUT_DIR = process.env.OUT_DIR ?? './audit-out'
const MIN = Number(process.env.MIN_DELAY_MS ?? 6000)
const MAX = Number(process.env.MAX_DELAY_MS ?? 18000)

function findAuthDir() {
  if (process.env.AUTH_DIR) return process.env.AUTH_DIR
  const candidates = [
    'auth', 'auth_info', 'auth_info_baileys', 'baileys_auth_info',
    'session', 'sessions', 'data/auth',
  ]
  for (const c of candidates) {
    if (existsSync(path.join(c, 'creds.json'))) return c
  }
  console.error('No auth folder found — set AUTH_DIR to the dir holding creds.json.')
  process.exit(1)
}

const baileys = await loadBaileys()
const makeWASocket =
  baileys.default?.default ?? baileys.default ?? baileys.makeWASocket
const { useMultiFileAuthState, DisconnectReason } = baileys

const authDir = findAuthDir()
console.log(`auth state: ${authDir}`)
const { state, saveCreds } = await useMultiFileAuthState(authDir)

const sock = makeWASocket({
  auth: state,
  printQRInTerminal: false,
  syncFullHistory: false,
  markOnlineOnConnect: false,
})
sock.ev.on('creds.update', saveCreds)

await new Promise((resolve, reject) => {
  sock.ev.on('connection.update', (u) => {
    if (u.connection === 'open') resolve()
    if (u.connection === 'close') {
      const code = u.lastDisconnect?.error?.output?.statusCode
      const conflict =
        code === 440 || code === DisconnectReason?.connectionReplaced
      reject(new Error(
        `connection closed (status ${code ?? 'unknown'})` +
        (conflict ? ' — the bot is probably still running; pm2 stop it first' : '')
      ))
    }
  })
})
console.log('connected')

// Resolve the group: accept a JID directly, or match on subject.
let meta
if (GROUP.endsWith('@g.us')) {
  meta = await sock.groupMetadata(GROUP)
} else {
  const all = await sock.groupFetchAllParticipating()
  const matches = Object.values(all).filter((g) =>
    (g.subject ?? '').toLowerCase().includes(GROUP.toLowerCase()))
  if (matches.length !== 1) {
    console.error(matches.length === 0
      ? 'No group subject matched.'
      : `Matched ${matches.length} groups — be more specific or pass the JID:`)
    for (const g of matches) console.error(`  ${g.id}  ${g.subject}`)
    process.exit(1)
  }
  meta = matches[0]
}
console.log(`group: ${meta.subject} — ${meta.participants.length} participants`)

await mkdir(path.join(OUT_DIR, 'avatars'), { recursive: true })

const rows = []
let i = 0
for (const p of meta.participants) {
  i++
  // Depending on Baileys version / LID migration, some of these are absent.
  const row = {
    id: p.id,
    jid: p.jid ?? null,
    lid: p.lid ?? null,
    phoneNumber: p.phoneNumber ?? null,
    admin: p.admin ?? null,
    avatar: { status: 'unknown', file: null, sha256: null },
  }

  const file = path.join(OUT_DIR, 'avatars', `${safe(p.id)}.jpg`)
  if (existsSync(file)) {
    row.avatar = { status: 'cached', file: path.basename(file), sha256: null }
  } else {
    try {
      const url = await sock.profilePictureUrl(p.id, 'image') // full size
      const res = await fetch(url)
      if (!res.ok) throw new Error(`http ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(file, buf)
      row.avatar = {
        status: 'ok',
        file: path.basename(file),
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      }
    } catch (e) {
      const msg = String(e?.message ?? e)
      row.avatar.status = /404|not-authorized|item-not-found/i.test(msg)
        ? 'hidden-or-none'   // privacy setting or genuinely no photo — can't tell apart
        : `error: ${msg}`
    }
    await sleep(jitter(MIN, MAX)) // drip only on actual network fetches
  }

  rows.push(row)
  console.log(`[${i}/${meta.participants.length}] ${p.id} — ${row.avatar.status}`)
}

const out = {
  fetchedAt: new Date().toISOString(),
  group: {
    id: meta.id,
    subject: meta.subject,
    size: meta.participants.length,
    creation: meta.creation ?? null,
    joinApprovalMode: meta.joinApprovalMode ?? null,
    memberAddMode: meta.memberAddMode ?? null,
  },
  participants: rows,
}
await writeFile(
  path.join(OUT_DIR, 'participants.json'),
  JSON.stringify(out, null, 2),
)
console.log(`wrote ${path.join(OUT_DIR, 'participants.json')}`)

sock.end(undefined)
setTimeout(() => process.exit(0), 1500)
