# Environment

## Required
- NODE_ENV
- PORT (api)
- WEB_PORT (web)
- SESSION_SECRET
- OAUTH_GOOGLE_CLIENT_ID
- OAUTH_GOOGLE_CLIENT_SECRET
- OAUTH_GOOGLE_REDIRECT_URI
- ENCRYPTION_KEYRING_JSON (JSON array of {version, key} base64)
  - OR ENCRYPTION_KEY_BASE64 + KEY_VERSION
- ADMIN_EMAILS (comma-separated)
- OPENAI_API_KEY
- DATABASE_URL (Postgres connection string)

## Optional
- DRIVE_ADAPTER ("google" to use Google Drive; defaults to stub)
- GOOGLE_DRIVE_CLIENT_EMAIL (service account client email)
- GOOGLE_DRIVE_PRIVATE_KEY (service account private key, \n escaped)
- SESSION_TTL_MS
