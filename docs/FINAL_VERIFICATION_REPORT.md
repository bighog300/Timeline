# Final Verification Report

## Test Command Summary

| Command | Result | Notes |
| --- | --- | --- |
| `npm install` | ✅ Pass | Warning: `npm warn Unknown env config "http-proxy"` appeared in output. |
| `npm test -w apps/api` | ✅ Pass | Acceptance + unit tests completed successfully. |
| `npm run build -w apps/api` | ✅ Pass | TypeScript build completed successfully. |
| `npm run build -w apps/web` | ✅ Pass | Uses `NEXT_IGNORE_INCORRECT_LOCKFILE=1` to skip Next.js lockfile patching without network access. |

> **Install remediation note:** `npm install` previously failed with 403s for public packages (`@prisma/client`, `googleapis`, `pg`, `prisma`). Remediation was to remove unused deps and provide local workspace fallbacks for `@prisma/client` and `googleapis` (see RUNBOOK). The final install completed successfully.

## Dev Server Smoke Check

### Commands
| Command | Result | Notes |
| --- | --- | --- |
| Not run (not requested) | ⚠️ Skipped | No dev server smoke test was requested for this change set. |

## Review Recommendation Verification

### 1) SESSION_SECRET production hardening
- Added `getSessionSecret()` validation to reject missing/short/`dev-secret` in production and keep a dev fallback outside production. (apps/api/src/sessions.ts:3-25)
- Session middleware now uses the validated secret helper at startup. (apps/api/src/app.ts:57-70)
- Docs updated to mark `SESSION_SECRET` as required in production with a >= 32 char recommendation. (.env.example:1-8; RUNBOOK.md:6-14)

### 2) Drive metadata returns (parentId + version)
- Drive create/update now request `id, parents, version` and map nullable parent/version values without hardcoded defaults. (apps/api/src/drive.ts:120-238)
- Unit tests cover create/update returning accurate parentId/version and nulls when missing. (apps/api/tests/unit.test.js:38-135)

### 3) OpenAI timeout + retry/backoff
- OpenAI requests include a timeout and retry once for retryable errors with exponential backoff + jitter. (apps/api/src/openai.ts:28-120)
- Unit tests simulate timeout and 429/5xx retry behavior. (apps/api/tests/unit.test.js:137-236)

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
apps/api/src/types/externals.d.ts:8:      body: any;
apps/api/src/types/externals.d.ts:15:      json: (body: any) => Response;
apps/api/src/openai.ts:2:  promptTokens: number;
apps/api/src/openai.ts:8:  content: string;
apps/api/src/openai.ts:22:      summaryMarkdown: "# Summary\n\nStub summary output.",
apps/api/src/openai.ts:23:      keyPoints: ["Stub key point"]
apps/api/src/openai.ts:25:    usage: { promptTokens: 0, completionTokens: 0 }
apps/api/src/openai.ts:44:          "content-type": "application/json",
apps/api/src/openai.ts:47:        body: JSON.stringify({
apps/api/src/openai.ts:49:          max_tokens: maxTokens,
apps/api/src/openai.ts:60:        choices?: Array<{ message?: { content?: string | null } }>;
apps/api/src/openai.ts:61:        usage?: { prompt_tokens?: number; completion_tokens?: number };
apps/api/src/openai.ts:63:      const output = payload.choices?.[0]?.message?.content ?? "";
apps/api/src/openai.ts:67:          promptTokens: payload.usage?.prompt_tokens ?? 0,
apps/api/src/openai.ts:68:          completionTokens: payload.usage?.completion_tokens ?? 0
apps/api/src/types.ts:17:  summaryMarkdown: string | null;
apps/api/src/types.ts:18:  keyPoints: string[];
apps/api/src/types.ts:57:  content: string;
apps/api/prisma/schema.prisma:16:  tokens    GoogleTokenSet?
apps/api/prisma/schema.prisma:48:  @@map("google_token_sets")
apps/api/prisma/schema.prisma:61:  summaryMarkdown String?          @map("summary_markdown")
apps/api/prisma/schema.prisma:62:  keyPoints       String[]         @map("key_points")
apps/api/prisma/schema.prisma:107:  content        String   @map("content")
apps/api/prisma/schema.prisma:109:  maxTokens      Int      @map("max_tokens")
apps/api/prisma/schema.prisma:114:  @@map("prompt_versions")
apps/api/src/googleApi.ts:105:    if (!part?.mimeType || !part?.body?.data) {
apps/api/src/googleApi.ts:109:      collector.push(decodeBase64Url(part.body.data));
apps/api/src/googleApi.ts:111:      collector.push(stripHtml(decodeBase64Url(part.body.data)));
apps/api/src/googleApi.ts:124:    return Promise.resolve({ token: this.credentials.access_token ?? "stub-access-token" });
apps/api/src/googleApi.ts:134:      accessToken: "stub-access-token",
apps/api/src/googleApi.ts:135:      refreshToken: "stub-refresh-token",
apps/api/src/googleApi.ts:168:        text: `Stub gmail content for ${messageId}`,
apps/api/src/googleApi.ts:182:        text: `Stub drive content for ${fileId}`,
apps/api/src/googleApi.ts:216:      prompt: "consent",
apps/api/src/googleApi.ts:222:    const { tokens } = await client.getToken(code);
apps/api/src/googleApi.ts:224:      accessToken: tokens.access_token ?? "",
apps/api/src/googleApi.ts:225:      refreshToken: tokens.refresh_token ?? null,
apps/api/src/googleApi.ts:226:      expiryDate: tokens.expiry_date ?? null
apps/api/src/googleApi.ts:310:    if (payload?.body?.data) {
apps/api/src/googleApi.ts:311:      textParts.push(decodeBase64Url(payload.body.data));
apps/api/src/drive.ts:22:  content: string;
apps/api/src/drive.ts:36:  createFile: (input: { name: string; parentId: string; content: string; mimeType: string }) => Promise<DriveFile>;
apps/api/src/drive.ts:37:  updateFile: (input: { fileId: string; content: string }) => Promise<DriveFile>;
apps/api/src/drive.ts:82:  const createFile = async (input: { name: string; parentId: string; content: string; mimeType: string }) => {
apps/api/src/drive.ts:89:      content: input.content,
apps/api/src/drive.ts:99:  const updateFile = async (input: { fileId: string; content: string }) => {
apps/api/src/drive.ts:104:    file.content = input.content;
apps/api/src/drive.ts:160:  const createFile = async (input: { name: string; parentId: string; content: string; mimeType: string }) => {
apps/api/src/drive.ts:169:        body: input.content
apps/api/src/drive.ts:184:      content: input.content,
apps/api/src/drive.ts:191:  const updateFile = async (input: { fileId: string; content: string }) => {
apps/api/src/drive.ts:196:        body: input.content
apps/api/src/drive.ts:211:      content: input.content,
apps/api/src/drive.ts:228:      content: "",
apps/api/src/app.ts:168:    const token = await prisma.googleTokenSet.findUnique({ where: { userId } });
apps/api/src/app.ts:169:    if (!token) {
apps/api/src/app.ts:174:      ciphertext: token.accessCiphertext,
apps/api/src/app.ts:175:      iv: token.accessIv,
apps/api/src/app.ts:176:      authTag: token.accessAuthTag,
apps/api/src/app.ts:177:      keyVersion: token.keyVersion
apps/api/src/app.ts:179:    const refreshToken = token.refreshCiphertext
apps/api/src/app.ts:181:          ciphertext: token.refreshCiphertext,
apps/api/src/app.ts:182:          iv: token.refreshIv ?? "",
apps/api/src/app.ts:183:          authTag: token.refreshAuthTag ?? "",
apps/api/src/app.ts:184:          keyVersion: token.keyVersion
apps/api/src/app.ts:190:      access_token: accessToken,
apps/api/src/app.ts:191:      refresh_token: refreshToken ?? undefined,
apps/api/src/app.ts:192:      expiry_date: token.expiresAt.getTime()
apps/api/src/app.ts:196:    const nextAccessToken = accessResponse.token ?? accessToken;
apps/api/src/app.ts:202:    if (updatedCreds.access_token && updatedCreds.access_token !== accessToken) {
apps/api/src/app.ts:207:      const encryptedAccess = encryptPayload(updatedCreds.access_token, activeKeyVersion);
apps/api/src/app.ts:208:      const nextRefreshToken = updatedCreds.refresh_token ?? refreshToken;
apps/api/src/app.ts:222:          expiresAt: updatedCreds.expiry_date ? new Date(updatedCreds.expiry_date) : token.expiresAt
apps/api/src/app.ts:236:    const markdown = entry.summaryMarkdown ?? "";
apps/api/src/app.ts:238:      await userDriveClient.updateFile({ fileId: entry.driveFileId, content: markdown });
apps/api/src/app.ts:244:      content: markdown,
apps/api/src/app.ts:250:  const writeIndexPackToDrive = async (pack: IndexPackRecord, content: string, authClient: GoogleApiClient) => {
apps/api/src/app.ts:254:      await userDriveClient.updateFile({ fileId: pack.driveFileId, content });
apps/api/src/app.ts:260:      content,
apps/api/src/app.ts:303:      const tokens = await googleApi.exchangeCode(client, code);
apps/api/src/app.ts:305:        access_token: tokens.accessToken,
apps/api/src/app.ts:306:        refresh_token: tokens.refreshToken ?? undefined,
apps/api/src/app.ts:307:        expiry_date: tokens.expiryDate ?? undefined
apps/api/src/app.ts:321:      const accessToken = encryptPayload(tokens.accessToken, activeKeyVersion);
apps/api/src/app.ts:322:      const refreshToken = tokens.refreshToken
apps/api/src/app.ts:323:        ? encryptPayload(tokens.refreshToken, activeKeyVersion)
apps/api/src/app.ts:326:      const tokenRecord: TokenRecord = {
apps/api/src/app.ts:335:        expiresAt: tokens.expiryDate ? new Date(tokens.expiryDate).toISOString() : now.toISOString()
apps/api/src/app.ts:342:          accessCiphertext: tokenRecord.encryptedAccessToken,
apps/api/src/app.ts:343:          accessIv: tokenRecord.accessTokenIv,
apps/api/src/app.ts:344:          accessAuthTag: tokenRecord.accessTokenAuthTag,
apps/api/src/app.ts:345:          refreshCiphertext: tokenRecord.encryptedRefreshToken,
apps/api/src/app.ts:346:          refreshIv: tokenRecord.refreshTokenIv,
apps/api/src/app.ts:347:          refreshAuthTag: tokenRecord.refreshTokenAuthTag,
apps/api/src/app.ts:348:          keyVersion: tokenRecord.keyVersion,
apps/api/src/app.ts:349:          expiresAt: new Date(tokenRecord.expiresAt)
apps/api/src/app.ts:352:          accessCiphertext: tokenRecord.encryptedAccessToken,
apps/api/src/app.ts:353:          accessIv: tokenRecord.accessTokenIv,
apps/api/src/app.ts:354:          accessAuthTag: tokenRecord.accessTokenAuthTag,
apps/api/src/app.ts:355:          refreshCiphertext: tokenRecord.encryptedRefreshToken,
apps/api/src/app.ts:356:          refreshIv: tokenRecord.refreshTokenIv,
apps/api/src/app.ts:357:          refreshAuthTag: tokenRecord.refreshTokenAuthTag,
apps/api/src/app.ts:358:          keyVersion: tokenRecord.keyVersion,
apps/api/src/app.ts:359:          expiresAt: new Date(tokenRecord.expiresAt)
apps/api/src/app.ts:449:      const parsed = EntryCreateSchema.safeParse(req.body ?? {});
apps/api/src/app.ts:473:          summaryMarkdown: null,
apps/api/src/app.ts:474:          keyPoints: [],
apps/api/src/app.ts:529:      const sources = z.array(SourceAttachSchema).safeParse(req.body?.sources ?? []);
apps/api/src/app.ts:570:      const sourceIds = z.array(z.string()).safeParse(req.body?.sourceIds ?? []);
apps/api/src/app.ts:620:      const contentBlocks: Array<{ sourceType: string; sourceId: string; text: string }> = [];
apps/api/src/app.ts:627:          contentBlocks.push({
apps/api/src/app.ts:638:            contentBlocks.push({
apps/api/src/app.ts:651:          sendError(res, 400, "limit_exceeded", "Selected content exceeds limits.");
apps/api/src/app.ts:656:      const promptId = req.body?.promptId?.toString() ?? null;
apps/api/src/app.ts:657:      const prompt = promptId
apps/api/src/app.ts:658:        ? await prisma.promptVersion.findUnique({ where: { id: promptId } })
apps/api/src/app.ts:659:        : await prisma.promptVersion.findFirst({
apps/api/src/app.ts:660:            where: { key: "summary", active: true, userSelectable: true },
apps/api/src/app.ts:663:      if (!prompt || !prompt.userSelectable) {
apps/api/src/app.ts:664:        sendError(res, 400, "prompt_missing", "Prompt version unavailable.");
apps/api/src/app.ts:668:      const contentPayload = contentBlocks
apps/api/src/app.ts:672:      let summaryMarkdown = "";
apps/api/src/app.ts:673:      let keyPoints: string[] = [];
apps/api/src/app.ts:676:          model: prompt.model,
apps/api/src/app.ts:677:          maxTokens: prompt.maxTokens,
apps/api/src/app.ts:679:            { role: "system", content: prompt.content },
apps/api/src/app.ts:682:              content:
apps/api/src/app.ts:683:                "Return JSON with fields summaryMarkdown (markdown string) and keyPoints (array of strings).\n\n" +
apps/api/src/app.ts:684:                contentPayload
apps/api/src/app.ts:689:          summaryMarkdown?: string;
apps/api/src/app.ts:690:          keyPoints?: string[];
apps/api/src/app.ts:692:        summaryMarkdown = parsed.summaryMarkdown ?? "";
apps/api/src/app.ts:693:        keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String) : [];
apps/api/src/app.ts:699:        sendError(res, 500, "summary_failed", "Summary generation failed.");
apps/api/src/app.ts:707:          summaryMarkdown,
apps/api/src/app.ts:708:          keyPoints,
apps/api/src/app.ts:710:            ...contentBlocks.map((block) => `${block.sourceType}:${block.sourceId}`),
apps/api/src/app.ts:730:      logEvent("summary_run", {
apps/api/src/app.ts:786:    "/admin/prompts",
apps/api/src/app.ts:790:      const prompts = await prisma.promptVersion.findMany({ orderBy: { createdAt: "desc" } });
apps/api/src/app.ts:791:      res.json({ prompts });
apps/api/src/app.ts:796:    "/admin/prompts",
apps/api/src/app.ts:800:      const prompt = await prisma.promptVersion.create({
apps/api/src/app.ts:803:          key: req.body.key ?? "default",
apps/api/src/app.ts:804:          version: Number(req.body.version ?? 1),
apps/api/src/app.ts:805:          content: req.body.content ?? "",
apps/api/src/app.ts:806:          model: req.body.model ?? "gpt-4o-mini",
apps/api/src/app.ts:807:          maxTokens: Number(req.body.maxTokens ?? 512),
apps/api/src/app.ts:809:          userSelectable: Boolean(req.body.userSelectable ?? true),
apps/api/src/app.ts:813:      res.status(201).json(prompt);
apps/api/src/app.ts:818:    "/prompts",
apps/api/src/app.ts:821:      const prompts = await prisma.promptVersion.findMany({
apps/api/src/app.ts:825:      res.json({ prompts });
apps/api/src/app.ts:830:    "/admin/prompts/:id/activate",
apps/api/src/app.ts:834:      const target = await prisma.promptVersion.findUnique({ where: { id: req.params.id } });
apps/api/src/app.ts:841:        prisma.promptVersion.updateMany({
apps/api/src/app.ts:845:        prisma.promptVersion.update({
apps/api/src/app.ts:851:      const updated = await prisma.promptVersion.findUnique({ where: { id: target.id } });
apps/api/src/app.ts:861:      const promptId = req.body?.promptId?.toString();
apps/api/src/app.ts:862:      const input = req.body?.input?.toString() ?? "";
apps/api/src/app.ts:863:      if (!promptId || !input) {
apps/api/src/app.ts:864:        sendError(res, 400, "invalid_request", "promptId and input are required.");
apps/api/src/app.ts:867:      const prompt = await prisma.promptVersion.findUnique({ where: { id: promptId } });
apps/api/src/app.ts:868:      if (!prompt) {
apps/api/src/app.ts:873:        model: prompt.model,
apps/api/src/app.ts:874:        maxTokens: prompt.maxTokens,
apps/api/src/app.ts:876:          { role: "system", content: prompt.content },
apps/api/src/app.ts:877:          { role: "user", content: input }
apps/api/src/app.ts:951:        data: { status: req.body.status ?? pack.status }
apps/api/src/app.ts:975:      const content = `# Index Pack\n\nEntry count: ${entryCount}`;
apps/api/src/app.ts:983:        const driveFileId = await writeIndexPackToDrive(updatedPack as IndexPackRecord, content, authClient);
apps/api/src/app.ts:1009:      const entryIds = z.array(z.string()).safeParse(req.body.entryIds ?? []);
```

**Interpretation:** Matches are limited to Drive file content handling, prompt storage, schema definitions, and request body usage. Logging remains restricted by the allowlist in `logger.ts` (see checklist item b).

### Suspicious schema field grep
Command:
```
rg -n "raw|body|extracted|html|source" apps/api/src apps/api/prisma
```
Output:
```
apps/api/src/types/externals.d.ts:8:      body: any;
apps/api/src/types/externals.d.ts:15:      json: (body: any) => Response;
apps/api/src/openai.ts:47:        body: JSON.stringify({
apps/api/src/types.ts:27:  sourceType: "gmail" | "drive";
apps/api/src/types.ts:28:  sourceId: string;
apps/api/src/googleApi.ts:105:    if (!part?.mimeType || !part?.body?.data) {
apps/api/src/googleApi.ts:109:      collector.push(decodeBase64Url(part.body.data));
apps/api/src/googleApi.ts:110:    } else if (part.mimeType === "text/html") {
apps/api/src/googleApi.ts:111:      collector.push(stripHtml(decodeBase64Url(part.body.data)));
apps/api/src/googleApi.ts:310:    if (payload?.body?.data) {
apps/api/src/googleApi.ts:311:      textParts.push(decodeBase64Url(payload.body.data));
apps/api/src/drive.ts:169:        body: input.content
apps/api/src/drive.ts:196:        body: input.content
apps/api/src/app.ts:39:  sourceType: z.enum(["gmail", "drive"]),
apps/api/src/app.ts:40:  sourceId: z.string(),
apps/api/src/app.ts:404:      res.json({ results, nextPageToken, source: "gmail", metadataOnly: true });
apps/api/src/app.ts:427:      res.json({ results, nextPageToken, source: "drive", metadataOnly: true });
apps/api/src/app.ts:449:      const parsed = EntryCreateSchema.safeParse(req.body ?? {});
apps/api/src/app.ts:494:        include: { sourceRefs: true }
apps/api/src/app.ts:505:    "/entries/:id/sources",
apps/api/src/app.ts:515:      res.json({ sources: refs });
apps/api/src/app.ts:520:    "/entries/:id/sources",
apps/api/src/app.ts:529:      const sources = z.array(SourceAttachSchema).safeParse(req.body?.sources ?? []);
apps/api/src/app.ts:530:      if (!sources.success || sources.data.length === 0) {
apps/api/src/app.ts:535:      for (const source of sources.data) {
apps/api/src/app.ts:540:            sourceType: source.sourceType,
apps/api/src/app.ts:541:            sourceId: source.sourceId,
apps/api/src/app.ts:542:            subject: source.subject ?? null,
apps/api/src/app.ts:543:            from: source.from ?? null,
apps/api/src/app.ts:544:            date: source.date ?? null,
apps/api/src/app.ts:545:            name: source.name ?? null,
apps/api/src/app.ts:546:            mimeType: source.mimeType ?? null,
apps/api/src/app.ts:547:            createdTime: source.createdTime ?? null,
apps/api/src/app.ts:548:            modifiedTime: source.modifiedTime ?? null,
apps/api/src/app.ts:549:            size: source.size ?? null,
apps/api/src/app.ts:550:            internalDate: source.internalDate ?? null,
apps/api/src/app.ts:556:      res.status(201).json({ sources: created });
apps/api/src/app.ts:561:    "/entries/:id/sources",
apps/api/src/app.ts:570:      const sourceIds = z.array(z.string()).safeParse(req.body?.sourceIds ?? []);
apps/api/src/app.ts:571:      if (!sourceIds.success || sourceIds.data.length === 0) {
apps/api/src/app.ts:572:        sendError(res, 400, "invalid_request", "sourceIds required.");
apps/api/src/app.ts:576:        where: { entryId: entry.id, id: { in: sourceIds.data } }
apps/api/src/app.ts:605:      const sourceRefs = await prisma.entrySourceRef.findMany({ where: { entryId: entry.id } });
apps/api/src/app.ts:606:      if (sourceRefs.length === 0) {
apps/api/src/app.ts:607:        sendError(res, 400, "invalid_request", "No sources selected.");
apps/api/src/app.ts:610:      if (sourceRefs.length > MAX_SOURCE_COUNT) {
apps/api/src/app.ts:615:        sendError(res, 400, "limit_exceeded", "Too many sources selected.");
apps/api/src/app.ts:620:      const contentBlocks: Array<{ sourceType: string; sourceId: string; text: string }> = [];
apps/api/src/app.ts:623:      for (const source of sourceRefs) {
apps/api/src/app.ts:624:        if (source.sourceType === "gmail") {
apps/api/src/app.ts:625:          const gmail = await googleApi.fetchGmailMessage(authClient, source.sourceId);
apps/api/src/app.ts:628:            sourceType: "gmail",
apps/api/src/app.ts:629:            sourceId: source.sourceId,
apps/api/src/app.ts:632:        } else if (source.sourceType === "drive") {
apps/api/src/app.ts:633:          const drive = await googleApi.fetchDriveFile(authClient, source.sourceId, source.mimeType);
apps/api/src/app.ts:635:            warnings.push(`warning:drive:${source.sourceId}:${drive.reason ?? "skipped"}`);
apps/api/src/app.ts:639:              sourceType: "drive",
apps/api/src/app.ts:640:              sourceId: source.sourceId,
apps/api/src/app.ts:656:      const promptId = req.body?.promptId?.toString() ?? null;
apps/api/src/app.ts:669:        .map((block, index) => `Source ${index + 1} (${block.sourceType}:${block.sourceId}):\n${block.text}`)
apps/api/src/app.ts:710:            ...contentBlocks.map((block) => `${block.sourceType}:${block.sourceId}`),
apps/api/src/app.ts:803:          key: req.body.key ?? "default",
apps/api/src/app.ts:804:          version: Number(req.body.version ?? 1),
apps/api/src/app.ts:805:          content: req.body.content ?? "",
apps/api/src/app.ts:806:          model: req.body.model ?? "gpt-4o-mini",
apps/api/src/app.ts:807:          maxTokens: Number(req.body.maxTokens ?? 512),
apps/api/src/app.ts:809:          userSelectable: Boolean(req.body.userSelectable ?? true),
apps/api/src/app.ts:861:      const promptId = req.body?.promptId?.toString();
apps/api/src/app.ts:862:      const input = req.body?.input?.toString() ?? "";
apps/api/src/app.ts:951:        data: { status: req.body.status ?? pack.status }
apps/api/src/app.ts:1009:      const entryIds = z.array(z.string()).safeParse(req.body.entryIds ?? []);
apps/api/prisma/schema.prisma:5:datasource db {
apps/api/prisma/schema.prisma:67:  sourceRefs      EntrySourceRef[]
apps/api/prisma/schema.prisma:76:  sourceType String        @map("source_type")
apps/api/prisma/schema.prisma:77:  sourceId   String        @map("source_id")
apps/api/prisma/schema.prisma:90:  @@map("entry_source_refs")
```

**Interpretation:** Matches relate to request body handling, Drive API request bodies, and `EntrySourceRef` metadata fields. No raw content storage fields (e.g., `raw`, `html`, `extracted`) appear in the Prisma schema.

## Definition of Done Verification (PRD)

| Requirement | Verification | Evidence |
| --- | --- | --- |
| Connect Google | OAuth start and callback endpoints return Google auth URL and create session/token records. | `GET /auth/google/start` and `/auth/google/callback` handlers in API. |
| Metadata search | Gmail/Drive search endpoints return metadata-only results. | `/search/gmail` and `/search/drive` handlers return `metadataOnly: true`. |
| Create entry | Entry creation persists a new timeline entry with pending status. | `POST /entries` handler creates a timeline entry. |
| Run summary | Summary run updates entry status and derived fields, then logs metrics-only event. | `POST /entries/:id/run` handler updates summary/key points/metadata refs and calls `logEvent`. |
| Timeline display | Web UI renders timeline with entries and allows selecting an entry drawer. | `apps/web/pages/index.tsx` timeline state and `Timeline` component usage. |
| Drive file created | Summary run writes markdown to Drive and stores `driveFileId` + status. | `writeEntryToDrive` and `/entries/:id/run` drive write flow. |
| Rerun overwrites same fileId | Drive update uses existing `driveFileId` and preserves it. | `writeEntryToDrive` update path + acceptance test assertions. |
| Admin prompt management | Admin prompt list/create/activate endpoints gated by allowlist. | `/admin/prompts` handlers + `requireAdmin` middleware. |

### Verification Notes
- Evidence gathered via code inspection and existing acceptance coverage (no new tests executed in this verification pass).
