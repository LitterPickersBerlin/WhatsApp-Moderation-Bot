import 'dotenv/config';
import { startBot } from './bot'
import { BOT_NAME } from './config'
import { version } from '../package.json'

console.log(`🤖 ${BOT_NAME} v${version} — starting`)

startBot().catch(console.error)
