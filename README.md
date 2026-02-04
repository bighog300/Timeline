# Timeline App

Timeline App is a privacy-first, explicit-only timeline builder where Google Drive is the system of record and no raw content is persisted outside derived summaries and metadata.

## Quickstart (dev)
- `pnpm install`
- Copy `.env.example` to `.env` and set required values.
  - Set `API_SERVER_ORIGIN=http://localhost:3001` for the web rewrite in dev.
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm dev:api`
- `pnpm dev:web`

## Documentation
- [PRD.md](PRD.md)
- [RUNBOOK.md](RUNBOOK.md)
- [docs/FINAL_VERIFICATION_REPORT.md](docs/FINAL_VERIFICATION_REPORT.md)
- [docs/SIMULATION_VERIFICATION_REPORT.md](docs/SIMULATION_VERIFICATION_REPORT.md)
- [RELEASE.md](RELEASE.md)

## Restricted environments
- `SHIM_ALLOW` is a dev/test-only escape hatch.
- Production blocks shims and stubs.
