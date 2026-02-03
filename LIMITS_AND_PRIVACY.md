# Limits and Privacy

## Privacy Rules
- Never persist raw Gmail/Drive content in DB, logs, files, or session.
- Only derived artifacts are stored (summary markdown, key points, metadata references).

## Fetch Constraints
- No background scanning.
- Fetch only on explicit user action (create/rerun summary).

## Logging
- Structured logs only: counts, durations, error codes.
- No content, no prompts, no tokens.

## Limits
- Enforce maximum bytes/tokens per run to prevent over-fetching.
- Fail fast if OAuth tokens are missing/invalid with `reconnect_required`.

