# API Spec

Base URL: `/api`

## Auth
- `GET /auth/google/start` -> redirect to Google OAuth
- `GET /auth/google/callback` -> handle callback, create session
- `POST /auth/logout` -> destroy session

## Entries
- `GET /entries` -> list entries
- `POST /entries` -> create entry
- `GET /entries/:id` -> entry detail
- `POST /entries/:id/run` -> run summarization

### Run Response
- `status`: `processing|ready|error`
- `driveWriteStatus`: `ok|pending|failed`
- `driveFileId`: string
- If tokens missing/invalid: `401 {"error":"reconnect_required"}`

## Search
- `GET /search/gmail` -> metadata only
- `GET /search/drive` -> metadata only

## Admin
- `GET /admin/prompts` -> list prompts
- `POST /admin/prompts` -> create new version (immutable)
- `PATCH /admin/prompts/:id/activate` -> activate version
- `POST /admin/playground` -> run text (no persistence)

## Index Packs
- `POST /index-packs` -> create stub pack
- `POST /index-packs/:id/run` -> explicit rehydrate skeleton

