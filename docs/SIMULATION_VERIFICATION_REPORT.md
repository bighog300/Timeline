# Simulation Verification Report

## Environment
- Mode: **Stub/simulated** (GOOGLE_API_STUB=1, OPENAI_STUB=1, DRIVE_ADAPTER=stub, NODE_ENV=development).
- Database: Prisma shim in-memory (SHIM_ALLOW=1 via `npm run dev -w apps/api`).
- Production DB note: production requires a real Postgres connection via `DATABASE_URL`, and startup guards reject shim packages (Prisma/Google APIs) in production.
- Encryption: `ENCRYPTION_KEY_BASE64` + `KEY_VERSION` set for token encryption.

## Verification Run (Evidence Strengthening)
- **Timestamp (UTC)**: 2026-02-04 09:01 UTC.
- **Tests**: `npm test -w apps/api` ✅ pass after evidence updates.

## Commands Executed (Baseline Build Verification)
| Step | Command | Result | Notes |
| --- | --- | --- | --- |
| 1 | `npm install` | ✅ Pass | `npm warn Unknown env config "http-proxy"`. |
| 2 | `npm test -w apps/api` | ✅ Pass | Acceptance + unit tests completed. |
| 3 | `npm run build -w apps/api` | ✅ Pass | `tsc` build. |
| 4 | `npm run build -w apps/web` | ✅ Pass | Next.js build complete. |

## Simulated End-to-End Run (Stub Mode)

### Server Start
- API: `npm run dev -w apps/api` with stub env vars.
- Web: `npm run dev -w apps/web`.

### A) Session + Connect Flow
1. **Unauthenticated** request:
   - `GET /entries` → **401**
   - Response: `{ "error": { "code": "unauthorized", "message": "Authentication required." } }`
2. **Start OAuth (stub)**:
   - `GET /auth/google/start` → **302** redirect to `https://example.test/oauth?state=...`.
3. **Complete OAuth (stub)**:
   - `GET /auth/google/callback?state=...&code=stub-code&email=stub@example.com` → **302** to `/`.

### B) Metadata-only Search (Gmail + Drive)
- `GET /search/gmail?q=test` → `{ metadataOnly: true, results: [...] }`
- `GET /search/drive?q=test` → `{ metadataOnly: true, results: [...] }`
- Verified: only metadata fields (no body/snippet/content).

### C) Create Entry
- `POST /entries` with title + dates + tags.
- Response includes new entry with `status: processing`, `driveWriteStatus: pending`.

### D) Attach/Detach Sources
- `POST /entries/:id/sources` with Gmail + Drive refs.
- `DELETE /entries/:id/sources` removing the Gmail ref → `{ removed: 1 }`.

### E) Run Summary (Explicit Action)
- `POST /entries/:id/run`
- Response:
  - `status: ready`
  - `driveWriteStatus: ok`
  - `driveFileId` set
  - `summaryMarkdown` + `keyPoints` present
  - `metadataRefs` includes only source refs

### F) Rerun Overwrite-by-fileId
- Re-ran `POST /entries/:id/run`.
- Verified `driveFileId` unchanged from first run.
- Evidence (excerpt):
  - First run `driveFileId`: `e06d46b6-f0ef-4136-8098-16225782222d`
  - Second run `driveFileId`: `e06d46b6-f0ef-4136-8098-16225782222d`

### G) Retry Drive Write Without Refetch
> This step used a **separate stub run** with `DRIVE_STUB_FAIL_ONCE=1` to force a single Drive write failure.

- `POST /entries/:id/run` → `driveWriteStatus: failed` (forced single failure).
- `POST /entries/:id/retry-drive-write` → `driveWriteStatus: ok`, `driveFileId` set.
- No Gmail/Drive refetch on retry (code path only writes existing summary).
- **Proof (stub counters)**: `gmailFetchCount` unchanged **1 → 1**, `driveFetchCount` unchanged **0 → 0** (asserted in acceptance test).

### H) reconnect_required Behavior
- `POST /google/disconnect?preserveSession=1` (stub-only) removes tokens while keeping session.
- `POST /entries/:id/run` → **401** `{ "error": "reconnect_required" }`.
- `GET /entries/:id` confirms entry status unchanged (`status: ready`, `driveWriteStatus: ok`).
- **No partial processing proof (before → after)**:
  - `status`: **ready → ready**
  - `driveWriteStatus`: **ok → ok**
  - `derivedArtifacts` count: **0 → 0** (no new rows created)
  - `updatedAt`: unchanged (no write executed before auth failure)

### I) Admin Separation
- Non-admin user:
  - `GET /admin/prompts` → **403** `{ "error": { "code": "forbidden" } }`.
- Admin user (`ADMIN_EMAILS=admin@example.com`):
  - Created prompt, activated prompt, and ran `/admin/playground`.
  - Playground uses admin-provided input only; no persistence beyond prompt versions.

## Privacy Verification (Grep + Invariants)
- **Schema check**: no raw Gmail/Drive body fields in entries; only derived artifacts + metadata refs.
- **Logging**: allowlist-based logging only (counts/ids/status); grep confirms no logging of tokens/prompts/content.
- **Errors**: structured `{ error: { code, message } }` responses without stack traces.

### Forbidden Data Grep Patterns (0 matches)
The following patterns were used to ensure no sensitive content is logged or persisted via log statements:
- `console\\.log\\(.*(summaryMarkdown|keyPoints|accessToken|refreshToken|prompt|openai|gmail|drive)`
- `logger\\.(info|warn|error).*\\b(summaryMarkdown|keyPoints|accessToken|refreshToken|prompt|openai|gmail|drive)\\b`
- **Summary**: 0 matches for all patterns (no raw Gmail/Drive content, prompts, OpenAI outputs, or tokens logged).

## Optional Real Integration Check
- **Not run**: missing `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI` and `OPENAI_API_KEY` in environment.

## Minimal Fixes Applied During Verification
1. **Persist stub Drive state across requests** to allow overwrite-by-fileId behavior in stub mode.
2. **Add stub-only single-failure toggle** (`DRIVE_STUB_FAIL_ONCE=1`) to validate retry flow.
3. **Stub-only disconnect flag** (`/google/disconnect?preserveSession=1`) to simulate `reconnect_required` without destroying session.

## PASS/FAIL Checklist (MVP Definition of Done)
- ✅ Explicit-only fetching (runs only on explicit /entries/:id/run).
- ✅ Metadata-only search (Gmail + Drive search returns metadata only).
- ✅ Attach/detach required before run (sources API enforced).
- ✅ Run produces derived only (summaryMarkdown/keyPoints, metadataRefs only).
- ✅ Drive overwrite-by-fileId (rerun keeps same driveFileId).
- ✅ Retry drive write w/out refetch (retry uses stored summary, no fetch).
- ✅ reconnect_required blocks processing with missing tokens.
- ✅ Admin allowlist enforced (non-admin blocked, admin allowed).
- ✅ No raw content persisted/logged (schema + logging allowlist).

## Evidence Pointers
- Commands + responses embedded in this report (privacy-safe excerpts).
- Code references:
  - Drive stub persistence + fail-once toggle (apps/api/src/drive.ts).
  - Stub-only disconnect preserveSession option (apps/api/src/app.ts).
  - Logging allowlist (apps/api/src/logger.ts).
  - Error responses structure (apps/api/src/errors.ts).
  - Entry run flow + metadata-only search enforcement (apps/api/src/app.ts).
  - Schema stores derived artifacts only (apps/api/prisma/schema.prisma).
