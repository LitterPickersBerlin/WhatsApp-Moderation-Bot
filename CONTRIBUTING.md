# Contributing

## Reporting bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Relevant logs (`pm2 logs`) or error messages
- Your Node.js version and OS

## Suggesting features

Open an issue describing the use case. Include why the current behaviour doesn't cover it.

## Pull requests

1. Fork the repo and create a branch from `master`
2. Make your changes
3. Run the test suite: `npm test`
4. Ensure `npm run build` passes with no TypeScript errors
5. Open a PR with a clear description of what changed and why

## Configuration

Never commit real phone numbers, group JIDs, or invite links. Use the example files:
- `.env.example` for environment variables
- `bot.config.example.json` for group/network/keyword config

## Project structure

```
src/
  handlers/     # WhatsApp event handlers (messages, reactions, participants)
  storage/      # Storage adapter (database or filesystem)
  utils/        # Helpers (classifier, networks, privacy)
  scripts/      # One-off CLI scripts (e.g. manual message delete)
  config.ts     # All configuration — env vars + bot.config.json
  bot.ts        # Socket setup and event wiring
migrations/     # SQL schema (single squashed file for fresh installs)
tests/          # Jest unit tests
```
