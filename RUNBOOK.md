# Runbook

## Start API
- Install dependencies
- `npm run dev -w apps/api`

## Start Web
- `npm run dev -w apps/web`

## OAuth Issues
- If `reconnect_required`, verify Google credentials and refresh token storage.
- Ensure encryption keys are configured via `ENCRYPTION_KEYRING_JSON` or `ENCRYPTION_KEY_BASE64` + `KEY_VERSION`.
- Required Google OAuth env vars: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`.
- OpenAI summaries require `OPENAI_API_KEY`.

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
