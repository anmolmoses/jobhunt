# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email the maintainer directly or use GitHub's private vulnerability reporting
3. Include: description of the vulnerability, steps to reproduce, potential impact

## Security Model

JobHunt is designed as a **single-user, self-hosted** application. It is NOT designed for multi-user or public deployment without additional security measures.

### What's Protected
- **API keys** are encrypted at rest using AES-256-GCM
- **Encryption secret** is validated for proper key length (32 bytes / 64 hex chars)
- **Job descriptions** are sanitized with DOMPurify before rendering
- **File uploads** are validated by extension and MIME type
- **Route parameters** are validated before database queries
- **PDF paths** are validated against path traversal attacks

### What's NOT Protected (by design for single-user)
- No authentication layer (add one if deploying multi-user)
- No CSRF tokens (single-user local app)
- No rate limiting (add if deploying publicly)
- Resume files stored unencrypted on disk

### Recommendations for Production Deployment

If you deploy this publicly or for multiple users, you MUST add:

1. **Authentication** — NextAuth.js or similar
2. **CSRF protection** — SameSite cookies + CSRF tokens
3. **Rate limiting** — Upstash Ratelimit or similar
4. **File encryption** — Encrypt uploads at rest
5. **HTTPS** — Never run without TLS in production
6. **Content Security Policy** — Restrict script sources

## Environment Variables

Never commit these to version control:
- `ENCRYPTION_SECRET` — 32-byte hex key for AES-256-GCM
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — AI provider keys
- `JSEARCH_API_KEY` / `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` — Job search keys
- `HAPPENSTANCE_API_KEY` — Networking API key
- `LOGODEV_API_KEY` — Company logo API key
- `HUNTER_API_KEY` — Email finder API key
