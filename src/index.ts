import 'dotenv/config';
import { startBot } from './bot'
import { BOT_NAME, SPAM_KEYWORDS, GROUP_NETWORKS, BAN_THRESHOLD, STORAGE_MODE, LOG_MESSAGES } from './config'
import { version } from '../package.json'

const _log = console.log.bind(console)
const _error = console.error.bind(console)
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19)
console.log   = (...args) => _log(`[${ts()}]`, ...args)
console.error = (...args) => _error(`[${ts()}]`, ...args)

const observedGroups = new Set(Object.values(GROUP_NETWORKS).flat())

console.log(`🤖 ${BOT_NAME} v${version} — starting`)
console.log(`📋 Storage: ${STORAGE_MODE} | Groups observed: ${observedGroups.size} | Ban threshold: ${BAN_THRESHOLD}`)
console.log(`🔑 Spam keywords (${SPAM_KEYWORDS.length}): ${SPAM_KEYWORDS.join(', ')}`)
if (LOG_MESSAGES) console.log('🐛 LOG_MESSAGES enabled — all message text will be logged')

startBot().catch(console.error)
