# Timeline App MVP Release

- **Release name:** Timeline App MVP
- **Proposed git tag:** `v0.1.0-mvp`

## What’s included
- MVP scope as defined in the product requirements document (PRD). See [PRD.md](PRD.md).
- Verified API + web builds and test coverage as documented in the verification reports.

## Verification artifacts
- [docs/FINAL_VERIFICATION_REPORT.md](docs/FINAL_VERIFICATION_REPORT.md)
- [docs/SIMULATION_VERIFICATION_REPORT.md](docs/SIMULATION_VERIFICATION_REPORT.md)

## Environments
- **Stub-mode verification:**
  - `GOOGLE_API_STUB=1`, `OPENAI_STUB=1`, `DRIVE_ADAPTER=stub`, `NODE_ENV=development`.
  - `SHIM_ALLOW=1` only for dev/test to enable shim packages.
- **Production mode requirements:**
  - All stub flags **unset**; shims **blocked**.
  - Required env: `DATABASE_URL`, `ENCRYPTION_KEY_BASE64`, `KEY_VERSION`, `SESSION_SECRET`.

## Release steps checklist
1) `npm install`
2) `npm test -w apps/api`
3) `npm run build -w apps/api`
4) `npm run build -w apps/web`
5) Manual staging smoke checklist: OAuth connect, metadata search, run summary, Drive file exists, rerun overwrites same fileId, reconnect_required.

## Tagging plan (commands)
```
git checkout main
git pull
git tag -a v0.1.0-mvp -m "Timeline App MVP"
git push origin v0.1.0-mvp
```

## Post-tag policy
After tagging, **no changes** should land on `v0.1.0-mvp`; only patch releases are allowed (e.g., `v0.1.1-mvp`).
