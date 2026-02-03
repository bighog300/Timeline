# Code Agent Instructions

- Never store raw Gmail/Drive content in DB/logs/files/sessions.
- No background jobs or cron.
- Admin endpoints must enforce allowlist.
- Drive is system of record; reuse stored fileId on reruns.
