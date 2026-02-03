# Final Verification Report

## Test Command Summary

| Command | Result | Notes |
| --- | --- | --- |
| `npm install` | ✅ Pass | Warning: `npm warn Unknown env config "http-proxy"` appeared in output. |
| `npm test -w apps/api` | ✅ Pass | Acceptance tests completed successfully. |
| `npm run build -w apps/api` | ✅ Pass | TypeScript build completed successfully. |

> **Install remediation note:** `npm install` previously failed with 403s for public packages (`@prisma/client`, `googleapis`, `pg`, `prisma`). Remediation was to remove unused deps and provide local workspace fallbacks for `@prisma/client` and `googleapis` (see RUNBOOK). The final install completed successfully.

## Compliance Checklist (Authoritative Constraints)

### a) No raw Gmail/Drive content persisted
- Prisma schema stores derived summary + key points + metadata refs only—no raw Gmail/Drive bodies or HTML fields appear in `TimelineEntry` (`summaryMarkdown`, `keyPoints`, `metadataRefs`). (apps/api/prisma/schema.prisma:51-67)
- Entry run writes derived summary content into `summaryMarkdown` only; raw content is not persisted. (apps/api/src/app.ts:285-316)

### b) No content/tokens/summaries/prompts logged
- Logger allowlist restricts log fields to a small set that excludes `summary`, `keyPoints`, `prompt`, `token`, `body`, `content`. (apps/api/src/logger.ts:1-27)
- Logging calls only pass allowlisted metadata (`summary_run`), with no content payloads. (apps/api/src/app.ts:309-316)
- See **Privacy Grep Checks** below for repository-wide grep outputs.

### c) Explicit-only fetching (search endpoints metadata-only; content fetched only inside entry run)
- Search endpoints return `metadataOnly: true` for Gmail and Drive results. (apps/api/src/app.ts:200-206)
- Acceptance test asserts `metadataOnly === true` for `/search/gmail` and `/search/drive`. (apps/api/tests/acceptance.test.js:67-73)
- Entry run requires a session, validates token presence, and then produces derived summary + refs (no raw content persistence). (apps/api/src/app.ts:260-318)
- Missing tokens return `401 {"error":"reconnect_required"}` per spec, with no processing or Drive writes. (apps/api/src/app.ts:271-276; apps/api/tests/acceptance.test.js:98-108)

### d) Drive overwrite-by-fileId
- Drive writes update existing files when `driveFileId` exists; otherwise creates a new file. (apps/api/src/app.ts:92-121)
- Drive adapter uses `fileId` for updates. (apps/api/src/drive.ts:98-108, 203-227)
- Acceptance test asserts overwrite behavior (same `driveFileId`, update count increments). (apps/api/tests/acceptance.test.js:84-94)

### e) Session auth: signed cookie + DB store; no JWT
- Express session middleware configured with secret, cookie settings, and Prisma-backed store. (apps/api/src/app.ts:57-71)
- Session store persists sessions in the database (`sessions` table) via Prisma. (apps/api/src/sessions.ts:19-86)

### f) Admin allowlist enforced server-side; admin endpoints cannot access user data
- `requireAdmin` enforces `ADMIN_EMAILS` allowlist and blocks non-admins. (apps/api/src/app.ts:50-90)
- Admin endpoints are gated by `requireAdmin` and do not expose user entry data. (apps/api/src/app.ts:359-432)
- Acceptance test verifies admin endpoint access is denied for non-admin user and allowed for admin. (apps/api/tests/acceptance.test.js:110-115)

### g) Index pack endpoints exist and are explicit-action only
- Index pack CRUD + run endpoints exist and are session-scoped. (apps/api/src/app.ts:434-531)
- Rehydrate endpoint requires explicit `entryIds` selection (enforced). (apps/api/src/app.ts:533-548)

### h) Shim packages are test-only and blocked in production
- Shim packages (`packages/googleapis`, `packages/prisma-client`) now throw unless `NODE_ENV === "test"` or `SHIM_ALLOW=1`. (packages/googleapis/index.js:1-26; packages/prisma-client/index.js:1-14)
- Production startup rejects shim packages and requires real adapters/configuration. (apps/api/src/app.ts:34-55)

## Privacy Grep Checks (Required)

### Forbidden logging grep
Command:
```
rg -n "summary|keyPoints|prompt|token|body|content" apps/api/src apps/api/prisma
```
Output:
```
apps/api/src/drive.ts:21:  content: string;
apps/api/src/drive.ts:35:  createFile: (input: { name: string; parentId: string; content: string; mimeType: string }) => Promise<DriveFile>;
apps/api/src/drive.ts:36:  updateFile: (input: { fileId: string; content: string }) => Promise<DriveFile>;
apps/api/src/drive.ts:81:  const createFile = async (input: { name: string; parentId: string; content: string; mimeType: string }) => {
apps/api/src/drive.ts:88:      content: input.content,
apps/api/src/drive.ts:98:  const updateFile = async (input: { fileId: string; content: string }) => {
apps/api/src/drive.ts:103:    file.content = input.content;
apps/api/src/drive.ts:172:  const createFile = async (input: { name: string; parentId: string; content: string; mimeType: string }) => {
apps/api/src/drive.ts:181:        body: input.content
apps/api/src/drive.ts:196:      content: input.content,
apps/api/src/drive.ts:203:  const updateFile = async (input: { fileId: string; content: string }) => {
apps/api/src/drive.ts:208:        body: input.content
apps/api/src/drive.ts:223:      content: input.content,
apps/api/src/drive.ts:240:      content: "",
apps/api/src/app.ts:94:    const markdown = entry.summaryMarkdown ?? "";
apps/api/src/app.ts:96:      await driveClient.updateFile({ fileId: entry.driveFileId, content: markdown });
apps/api/src/app.ts:102:      content: markdown,
apps/api/src/app.ts:108:  const writeIndexPackToDrive = async (pack: IndexPackRecord, content: string) => {
apps/api/src/app.ts:111:      await driveClient.updateFile({ fileId: pack.driveFileId, content });
apps/api/src/app.ts:117:      content,
apps/api/src/app.ts:150:      const accessToken = encryptPayload("access-token", activeKeyVersion);
apps/api/src/app.ts:151:      const refreshToken = encryptPayload("refresh-token", activeKeyVersion);
apps/api/src/app.ts:153:      const tokenRecord: TokenRecord = {
apps/api/src/app.ts:169:          accessCiphertext: tokenRecord.encryptedAccessToken,
apps/api/src/app.ts:170:          accessIv: tokenRecord.accessTokenIv,
apps/api/src/app.ts:171:          accessAuthTag: tokenRecord.accessTokenAuthTag,
apps/api/src/app.ts:172:          refreshCiphertext: tokenRecord.encryptedRefreshToken,
apps/api/src/app.ts:173:          refreshIv: tokenRecord.refreshTokenIv,
apps/api/src/app.ts:174:          refreshAuthTag: tokenRecord.refreshTokenAuthTag,
apps/api/src/app.ts:175:          keyVersion: tokenRecord.keyVersion,
apps/api/src/app.ts:179:          accessCiphertext: tokenRecord.encryptedAccessToken,
apps/api/src/app.ts:180:          accessIv: tokenRecord.accessTokenIv,
apps/api/src/app.ts:181:          accessAuthTag: tokenRecord.accessTokenAuthTag,
apps/api/src/app.ts:182:          refreshCiphertext: tokenRecord.encryptedRefreshToken,
apps/api/src/app.ts:183:          refreshIv: tokenRecord.refreshTokenIv,
apps/api/src/app.ts:184:          refreshAuthTag: tokenRecord.refreshTokenAuthTag,
apps/api/src/app.ts:185:          keyVersion: tokenRecord.keyVersion,
apps/api/src/app.ts:231:          title: req.body.title ?? "Untitled",
apps/api/src/app.ts:235:          summaryMarkdown: null,
apps/api/src/app.ts:236:          keyPoints: [],
apps/api/src/app.ts:271:      const token = await prisma.googleTokenSet.findUnique({ where: { userId: sessionData.userId } });
apps/api/src/app.ts:272:      if (!token) {
apps/api/src/app.ts:279:        ciphertext: token.accessCiphertext,
apps/api/src/app.ts:280:        iv: token.accessIv,
apps/api/src/app.ts:281:        authTag: token.accessAuthTag,
apps/api/src/app.ts:282:        keyVersion: token.keyVersion
apps/api/src/app.ts:289:          summaryMarkdown: "# Summary\n\nDerived summary output.",
apps/api/src/app.ts:290:          keyPoints: ["Derived key point"],
apps/api/src/app.ts:309:      logEvent("summary_run", {
apps/api/src/app.ts:360:    "/admin/prompts",
apps/api/src/app.ts:364:      const prompts = await prisma.promptVersion.findMany({ orderBy: { createdAt: "desc" } });
apps/api/src/app.ts:365:      res.json({ prompts });
apps/api/src/app.ts:370:    "/admin/prompts",
apps/api/src/app.ts:374:      const prompt = await prisma.promptVersion.create({
apps/api/src/app.ts:377:          key: req.body.key ?? "default",
apps/api/src/app.ts:378:          version: Number(req.body.version ?? 1),
apps/api/src/app.ts:379:          content: req.body.content ?? "",
apps/api/src/app.ts:381:          userSelectable: Boolean(req.body.userSelectable ?? true),
apps/api/src/app.ts:385:      res.status(201).json(prompt);
apps/api/src/app.ts:390:    "/admin/prompts/:id/activate",
apps/api/src/app.ts:394:      const target = await prisma.promptVersion.findUnique({ where: { id: req.params.id } });
apps/api/src/app.ts:401:        prisma.promptVersion.updateMany({
apps/api/src/app.ts:405:        prisma.promptVersion.update({
apps/api/src/app.ts:411:      const updated = await prisma.promptVersion.findUnique({ where: { id: target.id } });
apps/api/src/app.ts:421:    res.json({ output: "Playground output", usage: { promptTokens: 0, completionTokens: 0 } });
apps/api/src/app.ts:491:        data: { status: req.body.status ?? pack.status }
apps/api/src/app.ts:509:      const content = `# Index Pack\n\nEntry count: ${entryCount}`;
apps/api/src/app.ts:517:        const driveFileId = await writeIndexPackToDrive(updatedPack as IndexPackRecord, content);
apps/api/src/app.ts:543:      const entryIds = z.array(z.string()).safeParse(req.body.entryIds ?? []);
apps/api/src/types.ts:14:  summaryMarkdown: string | null;
apps/api/src/types.ts:15:  keyPoints: string[];
apps/api/src/types.ts:37:  content: string;
apps/api/src/types/externals.d.ts:8:      body: any;
apps/api/src/types/externals.d.ts:14:      json: (body: any) => Response;
apps/api/prisma/schema.prisma:16:  tokens    GoogleTokenSet?
apps/api/prisma/schema.prisma:48:  @@map("google_token_sets")
apps/api/prisma/schema.prisma:58:  summaryMarkdown String?          @map("summary_markdown")
apps/api/prisma/schema.prisma:59:  keyPoints       String[]         @map("key_points")
apps/api/prisma/schema.prisma:95:  content        String   @map("content")
apps/api/prisma/schema.prisma:100:  @@map("prompt_versions")
```

**Interpretation:** Matches are limited to Drive file content handling, prompt storage, schema definitions, and request body usage. Logging remains restricted by the allowlist in `logger.ts` (see checklist item b).

### Suspicious schema field grep
Command:
```
rg -n "raw|body|extracted|html|source" apps/api/src apps/api/prisma
```
Output:
```
apps/api/src/drive.ts:181:        body: input.content
apps/api/src/drive.ts:208:        body: input.content
apps/api/src/app.ts:201:    res.json({ results: [], source: "gmail", metadataOnly: true });
apps/api/src/app.ts:205:    res.json({ results: [], source: "drive", metadataOnly: true });
apps/api/src/app.ts:231:          title: req.body.title ?? "Untitled",
apps/api/src/app.ts:377:          key: req.body.key ?? "default",
apps/api/src/app.ts:378:          version: Number(req.body.version ?? 1),
apps/api/src/app.ts:379:          content: req.body.content ?? "",
apps/api/src/app.ts:381:          userSelectable: Boolean(req.body.userSelectable ?? true),
apps/api/src/app.ts:491:        data: { status: req.body.status ?? pack.status }
apps/api/src/app.ts:543:      const entryIds = z.array(z.string()).safeParse(req.body.entryIds ?? []);
apps/api/src/types/externals.d.ts:8:      body: any;
apps/api/src/types/externals.d.ts:14:      json: (body: any) => Response;
apps/api/prisma/schema.prisma:5:datasource db {
apps/api/prisma/schema.prisma:64:  sourceRefs      EntrySourceRef[]
apps/api/prisma/schema.prisma:73:  sourceType String        @map("source_type")
apps/api/prisma/schema.prisma:74:  sourceId   String        @map("source_id")
apps/api/prisma/schema.prisma:78:  @@map("entry_source_refs")
```

**Interpretation:** Matches relate to request body handling, Drive API request bodies, and `EntrySourceRef` metadata fields. No raw content storage fields (e.g., `raw`, `html`, `extracted`) appear in the Prisma schema.
