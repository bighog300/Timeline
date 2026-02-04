# Runbook

## Start API
- Install dependencies
- `npm run dev -w apps/api`

## Start Web
- `npm run dev -w apps/web`
- Ensure `API_SERVER_ORIGIN` points at the API (dev: `http://localhost:3001`).

## OAuth Issues
- If `reconnect_required`, verify Google credentials and refresh token storage.
- Ensure encryption keys are configured via `ENCRYPTION_KEYRING_JSON` or `ENCRYPTION_KEY_BASE64` + `KEY_VERSION`.
- Required Google OAuth env vars: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`.
- OpenAI summaries require `OPENAI_API_KEY`.
- Production requires `SESSION_SECRET` (>= 32 chars, not `dev-secret`).

## Drive Write Failures
- Confirm `drive.file` scope and folder permissions.
- Use `POST /entries/:id/drive-retry` after permissions are fixed.

## Session Cleanup
- Sessions expire based on `SESSION_TTL_MS` (default 7 days).
- Trigger cleanup with `POST /admin/sessions/cleanup` (no background jobs).

## npm install 403 (Forbidden)
- Confirm registry is set to the public npm registry:
  - `.npmrc` in the repo root and `apps/api/.npmrc` should point at `https://registry.npmjs.org/`.
  - `npm config set registry https://registry.npmjs.org/`
- Check for unintended registry overrides:
  - `.npmrc` in the repo, user home, or environment variables like `NPM_CONFIG_REGISTRY`.
- Verify proxy environment variables (such as `http-proxy`/`https-proxy`) are not pointing at a blocked registry.
- If you are behind a corporate registry, ensure your auth token is valid or temporarily unset the proxy variables.
- If a global npmrc is forcing a private registry, override with:
  - `npm --registry=https://registry.npmjs.org/ install`
- If access to specific packages is blocked (403 on a public package), use the local workspace fallbacks:
  - `packages/prisma-client` provides a minimal `@prisma/client`.
  - `packages/googleapis` provides a minimal `googleapis`.
  - Keep the workspace package versions aligned with the versions in `apps/api/package.json`.
  - **Escape hatch:** set `SHIM_ALLOW=1` only in restricted dev environments to enable the shims (never in production).

## Production Deployment

### 1) Deployment model (important)
- Production deployments MUST install and build **from service directories**, not from the repo root.
- Do NOT deploy using root workspaces.
- Rationale: the repo contains workspace shim packages (`@prisma/client`, `googleapis`) for restricted dev/test environments that are intentionally blocked in production.
- Deploy `apps/api` and `apps/web` independently.
- Each service uses its own `package.json` and installs real dependencies from npm.

### 2) API service deployment steps
Example (shell-style, platform-agnostic):
- `cd apps/api`
- `npm install`
- `npx prisma migrate deploy`
- `npm run build`
- `npm run start` (or equivalent)

Notes:
- `NODE_ENV=production` is required.
- `SESSION_SECRET` must be set and strong (>= 32 chars).
- Startup will fail if shim packages are active or secrets are missing (expected behavior).

### 3) Web service deployment steps
Example (shell-style, platform-agnostic):
- `cd apps/web`
- `npm install`
- `npm run build`
- `npm run start` (or equivalent)

Notes:
- Web talks to API via configured base URL or rewrites.
- Web does not need database access.
- For production rewrites, set `API_SERVER_ORIGIN` to the API origin (e.g., `https://api.example.com`).

### 4) Required production environment variables (summary)
API (required):
- `NODE_ENV` — must be `production`.
- `DATABASE_URL` — production database connection string.
- `SESSION_SECRET` — strong secret (>= 32 chars).
- `ENCRYPTION_KEY_BASE64` — encryption key material.
- `KEY_VERSION` — active key version.
- `GOOGLE_OAUTH_CLIENT_ID` — Google OAuth client ID.
- `GOOGLE_OAUTH_CLIENT_SECRET` — Google OAuth client secret.
- `GOOGLE_OAUTH_REDIRECT_URI` — OAuth redirect URI.
- `OPENAI_API_KEY` — OpenAI API key for summaries.
- `ADMIN_EMAILS` — admin allowlist.

Web (as applicable):
- `NEXT_PUBLIC_API_BASE_URL` — API base URL for the web app.
- `NEXT_PUBLIC_APP_BASE_URL` — public base URL for the web app.

Do NOT set stub flags in production:
- `GOOGLE_API_STUB`
- `OPENAI_STUB`
- `DRIVE_ADAPTER=stub`
- `SHIM_ALLOW`

### 5) Post-deploy verification (mandatory)
- API starts without shim errors.
- OAuth connect works with a real Google account.
- Metadata search returns real items.
- Summary run creates a markdown file in the user’s Google Drive under `Timeline App/Summaries/`.
- Rerun overwrites the same Drive file (same fileId).
- Disconnect causes `401 reconnect_required` with no partial processing.

### 6) Common deployment mistakes (callout)
- ❌ Deploying from repo root with workspaces enabled.
- ❌ Leaving `SHIM_ALLOW` or stub env vars set.
- ❌ Missing `SESSION_SECRET` in production.
- ❌ Forgetting to run Prisma migrations.
