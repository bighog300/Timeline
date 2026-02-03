# Timeline App PRD

## Goal
Timeline App provides privacy-first timeline summaries from Gmail and Google Drive data. Users explicitly initiate each summary run. The system stores only derived artifacts (summaries and metadata references) and writes every summary to Google Drive as the system of record.

## Non‑Negotiables
- Privacy-first: never store raw Gmail/Drive content in DB, logs, files, or session.
- No background scanning, queues, cron, or indexing jobs.
- Two services: web (Next.js SSR) and api (Express), deploy independently.
- Auth: signed cookie session with server-side session store (DB). No JWT.
- Drive is system of record: every summary stored in Drive in `Timeline App/Summaries/`.
- Admin separated via allowlist; admin UI must never expose user data.
- Logging: structured logs of counts/durations/error codes only.

## User Stories
- As a user, I can connect Google OAuth and run a summary on demand.
- As a user, I can browse a timeline and open entries to see derived content and metadata references.
- As an admin, I can manage prompt versions and run a playground without persisting content.

## Success Criteria
- Summaries are derived only from explicit user actions.
- Every summary is written/overwritten in the same Drive file for the entry.
- Admin access is strictly enforced server-side.

## Out of Scope
- Background indexing, continuous ingestion, and raw content storage.
