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

## Vercel deployment notes
- Vercel requires **Node 20.x**. This repo pins it via `.nvmrc` and `.node-version`.
- If Vercel `pnpm install` fails with `ERR_INVALID_THIS`, ensure pnpm v9 is pinned via the root `packageManager` field.
- Vercel scripts explicitly enable Corepack, activate pnpm v9, and sanity-check `@timeline/shared` resolution for `apps/web` before building.
- Recommended Vercel project settings (web app):
  - **Root Directory:** `.` (repo root)
  - **Install Command:** `pnpm run vercel:install`
  - **Build Command:** `pnpm run vercel:build`

## If pnpm install fails with 403
- Check the active registry: `pnpm config get registry`
- Point back to npmjs if needed: `pnpm config set registry https://registry.npmjs.org/`
- Corporate mirrors/proxies may override the registry via `~/.npmrc`, `NPM_CONFIG_REGISTRY`, or proxy env vars; ensure your auth token is valid or temporarily bypass the mirror.
- Run the preflight helper to confirm versions and registry: `pnpm preflight`

## Common workspace commands
- `pnpm test`
- `pnpm build`
- `pnpm lint`

## Documentation
- [PRD.md](PRD.md)
- [RUNBOOK.md](RUNBOOK.md)
- [docs/FINAL_VERIFICATION_REPORT.md](docs/FINAL_VERIFICATION_REPORT.md)
- [docs/SIMULATION_VERIFICATION_REPORT.md](docs/SIMULATION_VERIFICATION_REPORT.md)
- [RELEASE.md](RELEASE.md)

## Restricted environments
- `SHIM_ALLOW` is a dev/test-only escape hatch.
- Production blocks shims and stubs.
