# Environment

## Required
- NODE_ENV
- PORT (api)
- WEB_PORT (web)
- SESSION_SECRET (required in production; >= 32 chars and not "dev-secret")
- GOOGLE_OAUTH_CLIENT_ID
- GOOGLE_OAUTH_CLIENT_SECRET
- GOOGLE_OAUTH_REDIRECT_URI
- ENCRYPTION_KEYRING_JSON (JSON array of {version, key} base64)
  - OR ENCRYPTION_KEY_BASE64 + KEY_VERSION
- ADMIN_EMAILS (comma-separated)
- OPENAI_API_KEY
- DATABASE_URL (Postgres connection string)
- API_SERVER_ORIGIN (web proxy origin; dev: http://localhost:3001, prod: https://api.example.com)

## Optional
- DRIVE_ADAPTER ("google" to use Google Drive; defaults to stub)
- GOOGLE_DRIVE_CLIENT_EMAIL (service account client email)
- GOOGLE_DRIVE_PRIVATE_KEY (service account private key, \n escaped)
- SESSION_TTL_MS
- SESSION_COOKIE_NAME (defaults to timeline.sid)
- SESSION_COOKIE_SAMESITE (lax|strict|none; set to none for cross-origin)
- CORS_ALLOWED_ORIGINS (comma-separated origins to enable cross-origin cookies)
- CSRF_COOKIE_NAME (defaults to timeline.csrf)

## Local database setup
1) Create a local Postgres database (example below assumes `timeline` exists).
2) Set `DATABASE_URL` in your `.env`.
3) Install dependencies: `pnpm install`
4) Generate the Prisma client: `pnpm db:generate`
5) Apply migrations: `pnpm db:migrate`

If you need to reset locally, use `pnpm db:reset` (dev only).

## Cookie + CSRF guidance
- Same-origin (recommended): keep the web and API behind the same origin (Next.js rewrite or reverse proxy).
  - Keep `SESSION_COOKIE_SAMESITE=lax` (or `strict`) and avoid `CORS_ALLOWED_ORIGINS`.
- Cross-origin: set `CORS_ALLOWED_ORIGINS` and `SESSION_COOKIE_SAMESITE=none`.
  - Requests must include the `X-CSRF-Token` header matching the `timeline.csrf` cookie value.
