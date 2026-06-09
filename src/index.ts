import 'dotenv/config';
import { startBot } from './bot'
import { BOT_NAME } from './config'
import { version } from '../package.json'

const _log = console.log.bind(console)
const _error = console.error.bind(console)
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19)
console.log   = (...args) => _log(`[${ts()}]`, ...args)
console.error = (...args) => _error(`[${ts()}]`, ...args)

console.log(`🤖 ${BOT_NAME} v${version} — starting`)

startBot().catch(console.error)
