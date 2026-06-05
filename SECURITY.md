# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Email [github@littr.info](mailto:github@littr.info) with:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

You'll receive a response within 72 hours. Once confirmed, a fix will be released and the issue disclosed publicly after affected deployments have had reasonable time to update.

## Privacy notes for deployers

- WhatsApp JIDs are SHA-256 hashed before database storage — the DB does not contain phone numbers
- Phone numbers are truncated to country code only in stored records
- Display names are stored in plaintext — consider this if deploying for others
- All records auto-purge after 90 days
- `NUMBERS_TO_NOTIFY` and `ADMIN_NUMBERS` are sensitive — keep your `.env` out of version control
