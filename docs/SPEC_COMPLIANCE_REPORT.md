# Spec Compliance Report

## Privacy & Logging
**Status: PASS**
- Central logger now enforces an allowlist of safe fields and avoids logging content payloads.
- Error responses are normalized to `{ error: { code, message } }` to avoid leaking internals.

## Explicit-Only Fetching
**Status: PASS**
- Search endpoints return metadata-only responses.
- Content fetch/decrypt occurs only inside the entry run endpoint.

## Drive System of Record
**Status: PASS**
- Drive folders `Timeline App/` and `Summaries/` are created on demand.
- First run creates a single Drive file per entry; reruns overwrite by fileId.
- Drive write status is persisted (`ok|pending|failed`) and retry is exposed via `POST /entries/:id/drive-retry`.

## Token Encryption (AES-256-GCM)
**Status: PASS**
- AES-256-GCM with random 12-byte IV, auth tag stored separately.
- Per-row key versioning via env keyring (`ENCRYPTION_KEYRING_JSON` or `ENCRYPTION_KEY_BASE64` + `KEY_VERSION`).

## Auth & Sessions
**Status: PASS**
- Signed cookie sessions with a DB-backed session store and explicit cleanup endpoint.
- No JWT usage.

## Admin Separation
**Status: PASS**
- ADMIN_EMAILS allowlist enforced on all admin routes.
- Admin endpoints do not access user entries/summaries.

## Index Packs
**Status: PASS**
- CRUD skeleton includes list/get/update/run/rehydrate without background jobs.
- Run writes a markdown pack to Drive.

## Tests
**Status: PASS**
- Acceptance tests now exercise metadata-only search, drive overwrite on rerun, reconnect_required, and admin allowlist.
