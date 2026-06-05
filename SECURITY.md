# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Email [github@littr.info](mailto:github@littr.info) with:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

You'll receive a response within 72 hours. Once confirmed, a fix will be released and the issue disclosed publicly after affected deployments have had reasonable time to update.

## Privacy notes for deployers

- Spam scores are stored with SHA-256 hashed JIDs — no phone numbers in storage
- Keyword subscriptions store a raw WhatsApp JID alongside the hashed one — this is required to deliver alert DMs and cannot be avoided
- No display names, phone numbers, or user profiles are stored
- Subscriptions expire after 30 days (expired entries are ignored but not deleted)
- `NUMBERS_TO_NOTIFY` and `ADMIN_NUMBERS` contain real phone numbers — keep your `.env` out of version control
