# Timeline App

Timeline App is a privacy-first, explicit-only timeline builder where Google Drive is the system of record and no raw content is persisted outside derived summaries and metadata.

## Quickstart (dev)
- `npm install`
- `npm run dev -w apps/api`
- `npm run dev -w apps/web`

## Documentation
- [PRD.md](PRD.md)
- [RUNBOOK.md](RUNBOOK.md)
- [docs/FINAL_VERIFICATION_REPORT.md](docs/FINAL_VERIFICATION_REPORT.md)
- [docs/SIMULATION_VERIFICATION_REPORT.md](docs/SIMULATION_VERIFICATION_REPORT.md)
- [RELEASE.md](RELEASE.md)

## Restricted environments
- `SHIM_ALLOW` is a dev/test-only escape hatch.
- Production blocks shims and stubs.
