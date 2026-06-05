# LittrBot

A WhatsApp bot for community group moderation. Automatically removes spam, lets members subscribe to keyword alerts, and provides an optional web dashboard.

## Features

- **Spam detection & auto-removal** — scores messages against a configurable keyword list. Users who hit the ban threshold are removed from the group (and any linked groups in the same network).
- **Keyword alerts** — members DM the bot to subscribe to keywords. When a match is posted in a monitored group, the member gets a DM with a link back.
- **Group networks** — groups can be linked so a ban in one propagates to all others in the network.
- **Two storage modes** — use a PostgreSQL database for persistent tracking, or the filesystem for a zero-dependency setup.

---

## Requirements

- Node.js 20+
- A WhatsApp account for the bot (separate from your personal account — a SIM or virtual number works)
- PostgreSQL *(optional — database mode only)*

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/LitterPickersBerlin/WhatsApp-Moderation-Bot.git
cd WhatsApp-Moderation-Bot
npm install
```

### 2. Configure

Copy the example config files and fill them in:

```bash
cp .env.example .env
cp bot.config.example.json bot.config.json
```

Edit `.env` for environment-specific settings (phone numbers, database URL, etc.) and `bot.config.json` for your WhatsApp group JIDs and spam keywords. See [Configuration](#configuration) below.

### 3. Authenticate

Run the bot once to scan the QR code:

```bash
npm run dev
```

Scan the QR code with WhatsApp on your bot account. Auth credentials are saved to `./auth` and reused on subsequent starts.

### 4. Add the bot to your groups

In WhatsApp, add the bot's phone number to each group you want it to moderate. It needs to be a **group admin** to delete messages and remove members.

### 5. Find your group JIDs

Group JIDs look like `120363408042175763@g.us`. The easiest way to find them:

1. Start the bot (`npm run dev`)
2. Send any message in the group
3. The bot logs every message with the group JID:
   ```
   📨 Group message | group: 120363408042175763@g.us | ...
   ```
4. Copy the JID into `bot.config.json`

### 6. Run

**With PM2 (recommended for the bot):**

```bash
npm run build
pm2 start ecosystem.config.js
```

**Dashboard only (Docker):**

```bash
docker compose up -d
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOT_NAME` | No | `WhatsApp Moderator` | Display name shown in dashboard and startup log |
| `BOT_CONFIG` | No | `./bot.config.json` | Path to your bot config JSON file |
| `STORAGE_MODE` | No | `filesystem` | `filesystem` (default) or `database` |
| `DATA_DIR` | No | `./data` | Directory for filesystem storage |
| `DATABASE_URL` | DB mode | — | PostgreSQL connection string |
| `AUTH_DIR` | No | `./auth` | WhatsApp session directory |
| `NUMBERS_TO_NOTIFY` | Yes | — | Comma-separated phone numbers for spam alerts (e.g. `447700000000,447711111111`) |
| `ADMIN_NUMBERS` | No | — | Comma-separated numbers exempt from spam scoring |
| `BAN_THRESHOLD` | No | `-1` | Score at which a user is removed |
| `POINTS_PER_MSG` | No | `1` | Points awarded per clean message |
| `POINTS_MAX` | No | `100` | Maximum score cap |

---

## Configuration

All group and keyword configuration lives in `bot.config.json` (copied from `bot.config.example.json`). No TypeScript editing required.

### Spam keywords

```json
{
  "spamKeywords": ["bitcoin", "forex", "crypto"]
}
```

### Alert groups

Groups that members can subscribe to keyword alerts for. Each needs a unique emoji for the DM picker.

```json
{
  "alertGroups": [
    { "jid": "120363..@g.us", "name": "Food sharing", "emoji": "🍎", "inviteLink": "https://chat.whatsapp.com/..." }
  ]
}
```

Add `"adminOnly": true` to hide a group from regular users (visible only to `NUMBERS_TO_NOTIFY`).

### Group networks

Groups in the same network share ban propagation — removing someone in one group removes them from all others.

```json
{
  "groupNetworks": {
    "MY_COMMUNITY": [
      "120363..@g.us",
      "120363..@g.us"
    ]
  }
}
```

Only groups listed here are moderated. Groups not in any network are ignored entirely.

---

## Storage Modes

### Filesystem (default)

Set `STORAGE_MODE=filesystem`. Data is stored as JSON in `DATA_DIR`. No database required. Spam scores reset on restart.

### Database

Set `STORAGE_MODE=database` and provide a `DATABASE_URL`. Enables persistent scores, membership history, and reaction tracking across restarts.

Run migrations before first start:

```bash
npm run migrate
```

---

## Bot Commands (DM)

| Command | Description |
|---|---|
| `/alert sofa "food parcels"` | Subscribe to keyword alerts — single words and quoted phrases |
| `/subs` | List your active alerts |
| `help` | Show available commands |
| React ❌ | Cancel all your active alerts |

After sending `/alert`, the bot replies with a group picker. React with the group's emoji to subscribe to that group. React multiple times to add more groups.

---

## Privacy

- **Spam scores** are stored with SHA-256 hashed JIDs — no phone numbers
- **Keyword subscriptions** store a hashed JID for deduplication and a raw WhatsApp JID to deliver alert DMs — the raw JID is necessary to send messages and is not avoidable
- No display names, phone numbers, or user profiles are stored anywhere
- Subscriptions expire after 30 days — expired entries are ignored but not deleted from storage
- `NUMBERS_TO_NOTIFY` and `ADMIN_NUMBERS` contain real phone numbers — keep your `.env` out of version control

---

## Development

```bash
npm run dev       # run with ts-node
npm run build     # compile to dist/
npm test          # run tests
```
