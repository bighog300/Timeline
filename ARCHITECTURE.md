# Architecture

## Overview
Timeline App is a monorepo with two services and one shared package:
- `apps/web`: Next.js SSR UI.
- `apps/api`: Express API.
- `packages/shared`: Types and Zod schemas shared between services.

## Data Flow
1. User authenticates via Google OAuth (scopes: openid, email, profile, gmail.readonly, drive.readonly, drive.file).
2. Tokens are stored encrypted (AES-256-GCM) in the API database with per-row key versioning.
3. User initiates a summary run (`POST /entries/:id/run`).
4. API fetches metadata and minimal content only in-memory, performs summarization, stores derived artifacts in DB, and writes markdown to Drive.
5. API returns derived artifacts and Drive link metadata to web.

## Privacy Choices
- Raw Gmail/Drive content is never persisted in DB/logs/files/sessions.
- Logs only include counts, durations, and error codes.
- All fetches are explicit and user-triggered; no background jobs.

## Safe Defaults for Missing Details
- Minimal text extraction only for summarization; no retention of raw inputs.
- In-memory processing only; derived outputs stored.

## Deployment
- Web and API are independently deployable services.

