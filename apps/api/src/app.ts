import crypto from "crypto";
import express from "express";
import session from "express-session";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { decryptPayload, encryptPayload, getActiveKeyVersion } from "./crypto";
import { createDriveClient } from "./drive";
import type { DriveClient } from "./drive";
import { getPrismaClient } from "./db";
import { sendError } from "./errors";
import { createGoogleApi } from "./googleApi";
import type { GoogleApi, GoogleApiClient } from "./googleApi";
import { logEvent } from "./logger";
import { createOpenAIClient } from "./openai";
import type { OpenAIClient } from "./openai";
import { cleanupExpiredSessions, createSessionStore, getSessionSecret, getSessionTtlMs } from "./sessions";
import type {
  EntryRecord,
  IndexPackRecord,
  EntrySourceRefRecord,
  SessionData,
  TokenRecord
} from "./types";

const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string()
});

const EntryCreateSchema = z.object({
  title: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  tags: z.array(z.string()).optional()
});

const SourceAttachSchema = z.object({
  sourceType: z.enum(["gmail", "drive"]),
  sourceId: z.string(),
  subject: z.string().nullable().optional(),
  from: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  createdTime: z.string().nullable().optional(),
  modifiedTime: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  internalDate: z.string().nullable().optional()
});

const parseTags = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

type AppContext = {
  driveClient?: DriveClient;
  googleApi: GoogleApi;
  openaiClient: OpenAIClient;
  prisma: PrismaClient;
};

const ensureSessionData = (req: express.Request) => {
  const sessionData = req.session?.user as SessionData | undefined;
  const parsed = SessionSchema.safeParse(sessionData);
  return parsed.success ? parsed.data : null;
};

const handleAsync =
  (
    handler: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>
  ) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    void handler(req, res, next).catch(next);
  };

const MAX_SOURCE_COUNT = Number(process.env.MAX_SOURCE_COUNT ?? "20");
const MAX_TOTAL_CHARS = Number(process.env.MAX_TOTAL_CHARS ?? "60000");

export const createApp = (options: Partial<AppContext> = {}) => {
  if (process.env.NODE_ENV === "production") {
    const prismaPackage = require("@prisma/client") as { __isShim?: boolean };
    const googleapisPackage = require("googleapis") as { __isShim?: boolean };

    if (process.env.DRIVE_ADAPTER !== "google") {
      throw new Error("Production requires DRIVE_ADAPTER=google (stub adapter is not allowed).");
    }

    if (
      !process.env.GOOGLE_OAUTH_CLIENT_ID ||
      !process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
      !process.env.GOOGLE_OAUTH_REDIRECT_URI
    ) {
      throw new Error("Production requires Google OAuth credentials.");
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Production requires OPENAI_API_KEY.");
    }

    if (!process.env.DATABASE_URL) {
      throw new Error("Production requires DATABASE_URL to connect to the real database.");
    }

    if (prismaPackage.__isShim || googleapisPackage.__isShim) {
      throw new Error("Shim packages are not allowed in production.");
    }
  }

  const app = express();
  const driveClient = options.driveClient;
  const googleApi = options.googleApi ?? createGoogleApi();
  const openaiClient = options.openaiClient ?? createOpenAIClient();
  const prisma = options.prisma ?? getPrismaClient();

  const adminEmails = new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  app.use(express.json());
  app.use(
    session({
      secret: getSessionSecret(),
      resave: false,
      saveUninitialized: false,
      store: createSessionStore(prisma),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: getSessionTtlMs()
      }
    })
  );

  const requireSession = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const sessionData = ensureSessionData(req);
    if (!sessionData) {
      sendError(res, 401, "unauthorized", "Authentication required.");
      return;
    }
    next();
  };

  const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const sessionData = ensureSessionData(req);
    if (!sessionData || !adminEmails.has(sessionData.email)) {
      sendError(res, 403, "forbidden", "Admin access required.");
      return;
    }
    next();
  };

  const getAuthorizedClient = async (userId: string) => {
    const token = await prisma.googleTokenSet.findUnique({ where: { userId } });
    if (!token) {
      return null;
    }

    const accessToken = decryptPayload({
      ciphertext: token.accessCiphertext,
      iv: token.accessIv,
      authTag: token.accessAuthTag,
      keyVersion: token.keyVersion
    });
    const refreshToken = token.refreshCiphertext
      ? decryptPayload({
          ciphertext: token.refreshCiphertext,
          iv: token.refreshIv ?? "",
          authTag: token.refreshAuthTag ?? "",
          keyVersion: token.keyVersion
        })
      : null;

    const client = googleApi.getOAuthClient();
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken ?? undefined,
      expiry_date: token.expiresAt.getTime()
    });

    const accessResponse = await client.getAccessToken();
    const nextAccessToken = accessResponse.token ?? accessToken;
    if (!nextAccessToken) {
      return null;
    }

    const updatedCreds = client.credentials;
    if (updatedCreds.access_token && updatedCreds.access_token !== accessToken) {
      const activeKeyVersion = getActiveKeyVersion();
      if (!activeKeyVersion) {
        throw new Error("missing_keyring");
      }
      const encryptedAccess = encryptPayload(updatedCreds.access_token, activeKeyVersion);
      const nextRefreshToken = updatedCreds.refresh_token ?? refreshToken;
      const encryptedRefresh = nextRefreshToken
        ? encryptPayload(nextRefreshToken, activeKeyVersion)
        : { ciphertext: null, iv: null, authTag: null };
      await prisma.googleTokenSet.update({
        where: { userId },
        data: {
          accessCiphertext: encryptedAccess.ciphertext,
          accessIv: encryptedAccess.iv,
          accessAuthTag: encryptedAccess.authTag,
          refreshCiphertext: encryptedRefresh.ciphertext,
          refreshIv: encryptedRefresh.iv,
          refreshAuthTag: encryptedRefresh.authTag,
          keyVersion: activeKeyVersion,
          expiresAt: updatedCreds.expiry_date ? new Date(updatedCreds.expiry_date) : token.expiresAt
        }
      });
    }

    return client;
  };

  const getDriveClientForUser = (authClient: GoogleApiClient) =>
    driveClient ?? createDriveClient({ auth: authClient });

  const writeEntryToDrive = async (entry: EntryRecord, authClient: GoogleApiClient) => {
    const userDriveClient = getDriveClientForUser(authClient);
    const { summariesFolderId } = await userDriveClient.ensureTimelineFolders();
    const markdown = entry.summaryMarkdown ?? "";
    if (entry.driveFileId) {
      await userDriveClient.updateFile({ fileId: entry.driveFileId, content: markdown });
      return entry.driveFileId;
    }
    const file = await userDriveClient.createFile({
      name: `${entry.title}-${entry.id}.md`,
      parentId: summariesFolderId,
      content: markdown,
      mimeType: "text/markdown"
    });
    return file.id;
  };

  const writeIndexPackToDrive = async (pack: IndexPackRecord, content: string, authClient: GoogleApiClient) => {
    const userDriveClient = getDriveClientForUser(authClient);
    const { indexesFolderId } = await userDriveClient.ensureTimelineFolders();
    if (pack.driveFileId) {
      await userDriveClient.updateFile({ fileId: pack.driveFileId, content });
      return pack.driveFileId;
    }
    const file = await userDriveClient.createFile({
      name: `index-pack-${pack.id}.md`,
      parentId: indexesFolderId,
      content,
      mimeType: "text/markdown"
    });
    return file.id;
  };

  app.get("/health", (_req: express.Request, res: express.Response) => {
    res.json({ ok: true });
  });

  app.get("/auth/google/start", (req: express.Request, res: express.Response) => {
    const state = crypto.randomUUID();
    req.session.oauthState = state;
    const client = googleApi.getOAuthClient();
    const url = googleApi.getAuthUrl(client, state);
    res.redirect(url);
  });

  app.get(
    "/auth/google/callback",
    handleAsync(async (req, res) => {
      const activeKeyVersion = getActiveKeyVersion();
      if (!activeKeyVersion) {
        sendError(res, 500, "missing_keyring", "Token keyring not configured.");
        return;
      }

      const state = req.query.state?.toString() ?? "";
      if (!state || state !== req.session.oauthState) {
        sendError(res, 400, "invalid_state", "OAuth state mismatch.");
        return;
      }
      if (req.query.error) {
        sendError(res, 400, "oauth_error", "OAuth authorization failed.");
        return;
      }
      const code = req.query.code?.toString();
      if (!code) {
        sendError(res, 400, "missing_code", "OAuth code missing.");
        return;
      }

      const client = googleApi.getOAuthClient();
      const tokens = await googleApi.exchangeCode(client, code);
      client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken ?? undefined,
        expiry_date: tokens.expiryDate ?? undefined
      });

      const emailHint = req.query.email?.toString();
      const email = await googleApi.getUserEmail(client, emailHint);
      const now = new Date();
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email }
      });

      req.session.user = { id: req.sessionID ?? crypto.randomUUID(), userId: user.id, email } as SessionData;

      const accessToken = encryptPayload(tokens.accessToken, activeKeyVersion);
      const refreshToken = tokens.refreshToken
        ? encryptPayload(tokens.refreshToken, activeKeyVersion)
        : null;

      const tokenRecord: TokenRecord = {
        userId: user.id,
        encryptedAccessToken: accessToken.ciphertext,
        accessTokenIv: accessToken.iv,
        accessTokenAuthTag: accessToken.authTag,
        encryptedRefreshToken: refreshToken?.ciphertext ?? null,
        refreshTokenIv: refreshToken?.iv ?? null,
        refreshTokenAuthTag: refreshToken?.authTag ?? null,
        keyVersion: activeKeyVersion,
        expiresAt: tokens.expiryDate ? new Date(tokens.expiryDate).toISOString() : now.toISOString()
      };

      await prisma.googleTokenSet.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          accessCiphertext: tokenRecord.encryptedAccessToken,
          accessIv: tokenRecord.accessTokenIv,
          accessAuthTag: tokenRecord.accessTokenAuthTag,
          refreshCiphertext: tokenRecord.encryptedRefreshToken,
          refreshIv: tokenRecord.refreshTokenIv,
          refreshAuthTag: tokenRecord.refreshTokenAuthTag,
          keyVersion: tokenRecord.keyVersion,
          expiresAt: new Date(tokenRecord.expiresAt)
        },
        update: {
          accessCiphertext: tokenRecord.encryptedAccessToken,
          accessIv: tokenRecord.accessTokenIv,
          accessAuthTag: tokenRecord.accessTokenAuthTag,
          refreshCiphertext: tokenRecord.encryptedRefreshToken,
          refreshIv: tokenRecord.refreshTokenIv,
          refreshAuthTag: tokenRecord.refreshTokenAuthTag,
          keyVersion: tokenRecord.keyVersion,
          expiresAt: new Date(tokenRecord.expiresAt)
        }
      });

      res.redirect("/");
    })
  );

  app.post("/auth/logout", (req: express.Request, res: express.Response) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.post(
    "/google/disconnect",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      await prisma.googleTokenSet.deleteMany({ where: { userId: sessionData.userId } });
      const preserveSession =
        process.env.GOOGLE_API_STUB === "1" && req.query.preserveSession?.toString() === "1";
      if (preserveSession) {
        res.json({ ok: true });
        return;
      }
      req.session.destroy(() => {
        res.json({ ok: true });
      });
    })
  );

  app.get(
    "/search/gmail",
    requireSession,
    handleAsync(async (req: express.Request, res: express.Response) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const authClient = await getAuthorizedClient(sessionData.userId);
      if (!authClient) {
        res.status(401).json({ error: "reconnect_required" });
        return;
      }
      const query = req.query.q?.toString() ?? "";
      const pageToken = req.query.pageToken?.toString() ?? null;
      const maxResults = Number(req.query.maxResults ?? 10);
      const { results, nextPageToken } = await googleApi.searchGmail(
        authClient,
        query,
        pageToken,
        maxResults
      );
      res.json({ results, nextPageToken, source: "gmail", metadataOnly: true });
    })
  );

  app.get(
    "/search/drive",
    requireSession,
    handleAsync(async (req: express.Request, res: express.Response) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const authClient = await getAuthorizedClient(sessionData.userId);
      if (!authClient) {
        res.status(401).json({ error: "reconnect_required" });
        return;
      }
      const query = req.query.q?.toString() ?? "";
      const pageToken = req.query.pageToken?.toString() ?? null;
      const pageSize = Number(req.query.pageSize ?? 10);
      const { results, nextPageToken } = await googleApi.searchDrive(
        authClient,
        query,
        pageToken,
        pageSize
      );
      res.json({ results, nextPageToken, source: "drive", metadataOnly: true });
    })
  );

  app.get(
    "/entries",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const items = await prisma.timelineEntry.findMany({
        where: { userId: sessionData.userId },
        orderBy: { createdAt: "desc" }
      });
      res.json({ entries: items });
    })
  );

  app.post(
    "/entries",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const parsed = EntryCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        sendError(res, 400, "invalid_request", "Invalid entry payload.");
        return;
      }
      const startDate = new Date(parsed.data.startDate);
      if (Number.isNaN(startDate.getTime())) {
        sendError(res, 400, "invalid_request", "Start date is required.");
        return;
      }
      const endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
      if (parsed.data.endDate && Number.isNaN(endDate?.getTime() ?? NaN)) {
        sendError(res, 400, "invalid_request", "End date is invalid.");
        return;
      }
      const now = new Date();
      const entry = await prisma.timelineEntry.create({
        data: {
          id: crypto.randomUUID(),
          userId: sessionData.userId,
          title: parsed.data.title?.trim() || "Untitled",
          status: "processing",
          driveWriteStatus: "pending",
          driveFileId: null,
          summaryMarkdown: null,
          keyPoints: [],
          metadataRefs: [],
          startDate,
          endDate,
          tags: parseTags(parsed.data.tags),
          createdAt: now,
          updatedAt: now
        }
      });
      res.status(201).json(entry);
    })
  );

  app.get(
    "/entries/:id",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const entry = await prisma.timelineEntry.findUnique({
        where: { id: req.params.id },
        include: { sourceRefs: true }
      });
      if (!entry || entry.userId !== sessionData.userId) {
        sendError(res, 404, "not_found", "Entry not found.");
        return;
      }
      res.json(entry);
    })
  );

  app.get(
    "/entries/:id/sources",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const entry = await prisma.timelineEntry.findUnique({ where: { id: req.params.id } });
      if (!entry || entry.userId !== sessionData.userId) {
        sendError(res, 404, "not_found", "Entry not found.");
        return;
      }
      const refs = await prisma.entrySourceRef.findMany({ where: { entryId: entry.id } });
      res.json({ sources: refs });
    })
  );

  app.post(
    "/entries/:id/sources",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const entry = await prisma.timelineEntry.findUnique({ where: { id: req.params.id } });
      if (!entry || entry.userId !== sessionData.userId) {
        sendError(res, 404, "not_found", "Entry not found.");
        return;
      }
      const sources = z.array(SourceAttachSchema).safeParse(req.body?.sources ?? []);
      if (!sources.success || sources.data.length === 0) {
        sendError(res, 400, "invalid_request", "Sources payload required.");
        return;
      }
      const created: EntrySourceRefRecord[] = [];
      for (const source of sources.data) {
        const ref = await prisma.entrySourceRef.create({
          data: {
            id: crypto.randomUUID(),
            entryId: entry.id,
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            subject: source.subject ?? null,
            from: source.from ?? null,
            date: source.date ?? null,
            name: source.name ?? null,
            mimeType: source.mimeType ?? null,
            createdTime: source.createdTime ?? null,
            modifiedTime: source.modifiedTime ?? null,
            size: source.size ?? null,
            internalDate: source.internalDate ?? null,
            createdAt: new Date()
          }
        });
        created.push(ref as EntrySourceRefRecord);
      }
      res.status(201).json({ sources: created });
    })
  );

  app.delete(
    "/entries/:id/sources",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const entry = await prisma.timelineEntry.findUnique({ where: { id: req.params.id } });
      if (!entry || entry.userId !== sessionData.userId) {
        sendError(res, 404, "not_found", "Entry not found.");
        return;
      }
      const sourceIds = z.array(z.string()).safeParse(req.body?.sourceIds ?? []);
      if (!sourceIds.success || sourceIds.data.length === 0) {
        sendError(res, 400, "invalid_request", "sourceIds required.");
        return;
      }
      const removed = await prisma.entrySourceRef.deleteMany({
        where: { entryId: entry.id, id: { in: sourceIds.data } }
      });
      res.json({ removed: removed.count });
    })
  );

  app.post(
    "/entries/:id/run",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const entry = await prisma.timelineEntry.findUnique({ where: { id: req.params.id } });
      if (!entry || entry.userId !== sessionData.userId) {
        sendError(res, 404, "not_found", "Entry not found.");
        return;
      }

      const authClient = await getAuthorizedClient(sessionData.userId);
      if (!authClient) {
        res.status(401).json({ error: "reconnect_required" });
        return;
      }

      const start = Date.now();
      await prisma.timelineEntry.update({
        where: { id: entry.id },
        data: { status: "processing", driveWriteStatus: "pending" }
      });

      const sourceRefs = await prisma.entrySourceRef.findMany({ where: { entryId: entry.id } });
      if (sourceRefs.length === 0) {
        sendError(res, 400, "invalid_request", "No sources selected.");
        return;
      }
      if (sourceRefs.length > MAX_SOURCE_COUNT) {
        await prisma.timelineEntry.update({
          where: { id: entry.id },
          data: { status: "error" }
        });
        sendError(res, 400, "limit_exceeded", "Too many sources selected.");
        return;
      }

      let totalChars = 0;
      const contentBlocks: Array<{ sourceType: string; sourceId: string; text: string }> = [];
      const warnings: string[] = [];

      for (const source of sourceRefs) {
        if (source.sourceType === "gmail") {
          const gmail = await googleApi.fetchGmailMessage(authClient, source.sourceId);
          totalChars += gmail.text.length;
          contentBlocks.push({
            sourceType: "gmail",
            sourceId: source.sourceId,
            text: gmail.text
          });
        } else if (source.sourceType === "drive") {
          const drive = await googleApi.fetchDriveFile(authClient, source.sourceId, source.mimeType);
          if (drive.skipped) {
            warnings.push(`warning:drive:${source.sourceId}:${drive.reason ?? "skipped"}`);
          } else {
            totalChars += drive.text.length;
            contentBlocks.push({
              sourceType: "drive",
              sourceId: source.sourceId,
              text: drive.text
            });
          }
        }

        if (totalChars > MAX_TOTAL_CHARS) {
          await prisma.timelineEntry.update({
            where: { id: entry.id },
            data: { status: "error" }
          });
          sendError(res, 400, "limit_exceeded", "Selected content exceeds limits.");
          return;
        }
      }

      const promptId = req.body?.promptId?.toString() ?? null;
      const prompt = promptId
        ? await prisma.promptVersion.findUnique({ where: { id: promptId } })
        : await prisma.promptVersion.findFirst({
            where: { key: "summary", active: true, userSelectable: true },
            orderBy: { createdAt: "desc" }
          });
      if (!prompt || !prompt.userSelectable) {
        sendError(res, 400, "prompt_missing", "Prompt version unavailable.");
        return;
      }

      const contentPayload = contentBlocks
        .map((block, index) => `Source ${index + 1} (${block.sourceType}:${block.sourceId}):\n${block.text}`)
        .join("\n\n");

      let summaryMarkdown = "";
      let keyPoints: string[] = [];
      try {
        const response = await openaiClient.runChat({
          model: prompt.model,
          maxTokens: prompt.maxTokens,
          messages: [
            { role: "system", content: prompt.content },
            {
              role: "user",
              content:
                "Return JSON with fields summaryMarkdown (markdown string) and keyPoints (array of strings).\n\n" +
                contentPayload
            }
          ]
        });
        const parsed = JSON.parse(response.output) as {
          summaryMarkdown?: string;
          keyPoints?: string[];
        };
        summaryMarkdown = parsed.summaryMarkdown ?? "";
        keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String) : [];
      } catch {
        await prisma.timelineEntry.update({
          where: { id: entry.id },
          data: { status: "error" }
        });
        sendError(res, 500, "summary_failed", "Summary generation failed.");
        return;
      }

      let updatedEntry = await prisma.timelineEntry.update({
        where: { id: entry.id },
        data: {
          status: "ready",
          summaryMarkdown,
          keyPoints,
          metadataRefs: [
            ...contentBlocks.map((block) => `${block.sourceType}:${block.sourceId}`),
            ...warnings
          ],
          driveWriteStatus: "pending"
        }
      });

      try {
        const driveFileId = await writeEntryToDrive(updatedEntry as EntryRecord, authClient);
        updatedEntry = await prisma.timelineEntry.update({
          where: { id: entry.id },
          data: { driveWriteStatus: "ok", driveFileId }
        });
      } catch {
        updatedEntry = await prisma.timelineEntry.update({
          where: { id: entry.id },
          data: { driveWriteStatus: "failed" }
        });
      }

      logEvent("summary_run", {
        entryCount: 1,
        durationMs: Date.now() - start,
        errorCode: 0,
        entryId: updatedEntry.id,
        userId: updatedEntry.userId,
        driveWriteStatus: updatedEntry.driveWriteStatus
      });

      res.json(updatedEntry);
    })
  );

  const handleDriveRetry = handleAsync(async (req, res) => {
    const sessionData = ensureSessionData(req) as SessionData;
    const entry = await prisma.timelineEntry.findUnique({ where: { id: req.params.id } });
    if (!entry || entry.userId !== sessionData.userId) {
      sendError(res, 404, "not_found", "Entry not found.");
      return;
    }
    if (entry.driveWriteStatus === "ok") {
      res.json(entry);
      return;
    }

    const authClient = await getAuthorizedClient(sessionData.userId);
    if (!authClient) {
      res.status(401).json({ error: "reconnect_required" });
      return;
    }

    let updatedEntry = await prisma.timelineEntry.update({
      where: { id: entry.id },
      data: { driveWriteStatus: "pending" }
    });

    try {
      const driveFileId = await writeEntryToDrive(updatedEntry as EntryRecord, authClient);
      updatedEntry = await prisma.timelineEntry.update({
        where: { id: entry.id },
        data: { driveWriteStatus: "ok", driveFileId }
      });
    } catch {
      updatedEntry = await prisma.timelineEntry.update({
        where: { id: entry.id },
        data: { driveWriteStatus: "failed" }
      });
    }

    res.json(updatedEntry);
  });

  app.post("/entries/:id/retry-drive-write", requireSession, handleDriveRetry);
  app.post("/entries/:id/drive-retry", requireSession, handleDriveRetry);

  app.get(
    "/admin/prompts",
    requireSession,
    requireAdmin,
    handleAsync(async (_req, res) => {
      const prompts = await prisma.promptVersion.findMany({ orderBy: { createdAt: "desc" } });
      res.json({ prompts });
    })
  );

  app.post(
    "/admin/prompts",
    requireSession,
    requireAdmin,
    handleAsync(async (req, res) => {
      const prompt = await prisma.promptVersion.create({
        data: {
          id: crypto.randomUUID(),
          key: req.body.key ?? "default",
          version: Number(req.body.version ?? 1),
          content: req.body.content ?? "",
          model: req.body.model ?? "gpt-4o-mini",
          maxTokens: Number(req.body.maxTokens ?? 512),
          active: false,
          userSelectable: Boolean(req.body.userSelectable ?? true),
          createdAt: new Date()
        }
      });
      res.status(201).json(prompt);
    })
  );

  app.get(
    "/prompts",
    requireSession,
    handleAsync(async (_req, res) => {
      const prompts = await prisma.promptVersion.findMany({
        where: { active: true, userSelectable: true },
        orderBy: { createdAt: "desc" }
      });
      res.json({ prompts });
    })
  );

  app.patch(
    "/admin/prompts/:id/activate",
    requireSession,
    requireAdmin,
    handleAsync(async (req, res) => {
      const target = await prisma.promptVersion.findUnique({ where: { id: req.params.id } });
      if (!target) {
        sendError(res, 404, "not_found", "Prompt not found.");
        return;
      }

      await prisma.$transaction([
        prisma.promptVersion.updateMany({
          where: { key: target.key },
          data: { active: false }
        }),
        prisma.promptVersion.update({
          where: { id: target.id },
          data: { active: true }
        })
      ]);

      const updated = await prisma.promptVersion.findUnique({ where: { id: target.id } });
      res.json(updated);
    })
  );

  app.post(
    "/admin/playground",
    requireSession,
    requireAdmin,
    handleAsync(async (req: express.Request, res: express.Response) => {
      const promptId = req.body?.promptId?.toString();
      const input = req.body?.input?.toString() ?? "";
      if (!promptId || !input) {
        sendError(res, 400, "invalid_request", "promptId and input are required.");
        return;
      }
      const prompt = await prisma.promptVersion.findUnique({ where: { id: promptId } });
      if (!prompt) {
        sendError(res, 404, "not_found", "Prompt version not found.");
        return;
      }
      const response = await openaiClient.runChat({
        model: prompt.model,
        maxTokens: prompt.maxTokens,
        messages: [
          { role: "system", content: prompt.content },
          { role: "user", content: input }
        ]
      });
      res.json({ output: response.output, usage: response.usage });
    })
  );

  app.post(
    "/admin/sessions/cleanup",
    requireSession,
    requireAdmin,
    handleAsync(async (_req, res) => {
      const removed = await cleanupExpiredSessions(prisma);
      res.json({ removed });
    })
  );

  app.get(
    "/index-packs",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const packs = await prisma.indexPack.findMany({
        where: { userId: sessionData.userId },
        orderBy: { createdAt: "desc" }
      });
      res.json({ packs });
    })
  );

  app.get(
    "/index-packs/:id",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const pack = await prisma.indexPack.findUnique({ where: { id: req.params.id } });
      if (!pack || pack.userId !== sessionData.userId) {
        sendError(res, 404, "not_found", "Index pack not found.");
        return;
      }
      res.json(pack);
    })
  );

  app.post(
    "/index-packs",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const pack = await prisma.indexPack.create({
        data: {
          id: crypto.randomUUID(),
          userId: sessionData.userId,
          driveFileId: null,
          status: "pending",
          createdAt: new Date()
        }
      });
      res.status(201).json(pack);
    })
  );

  app.patch(
    "/index-packs/:id",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const pack = await prisma.indexPack.findUnique({ where: { id: req.params.id } });
      if (!pack || pack.userId !== sessionData.userId) {
        sendError(res, 404, "not_found", "Index pack not found.");
        return;
      }
      const updated = await prisma.indexPack.update({
        where: { id: pack.id },
        data: { status: req.body.status ?? pack.status }
      });
      res.json(updated);
    })
  );

  app.post(
    "/index-packs/:id/run",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const pack = await prisma.indexPack.findUnique({ where: { id: req.params.id } });
      if (!pack || pack.userId !== sessionData.userId) {
        sendError(res, 404, "not_found", "Index pack not found.");
        return;
      }

      const authClient = await getAuthorizedClient(sessionData.userId);
      if (!authClient) {
        res.status(401).json({ error: "reconnect_required" });
        return;
      }

      const entryCount = await prisma.timelineEntry.count({ where: { userId: sessionData.userId } });
      const content = `# Index Pack\n\nEntry count: ${entryCount}`;

      let updatedPack = await prisma.indexPack.update({
        where: { id: pack.id },
        data: { status: "pending" }
      });

      try {
        const driveFileId = await writeIndexPackToDrive(updatedPack as IndexPackRecord, content, authClient);
        updatedPack = await prisma.indexPack.update({
          where: { id: pack.id },
          data: { status: "ready", driveFileId }
        });
      } catch {
        updatedPack = await prisma.indexPack.update({
          where: { id: pack.id },
          data: { status: "error" }
        });
      }

      res.json(updatedPack);
    })
  );

  app.post(
    "/index-packs/:id/rehydrate",
    requireSession,
    handleAsync(async (req, res) => {
      const sessionData = ensureSessionData(req) as SessionData;
      const pack = await prisma.indexPack.findUnique({ where: { id: req.params.id } });
      if (!pack || pack.userId !== sessionData.userId) {
        sendError(res, 404, "not_found", "Index pack not found.");
        return;
      }
      const entryIds = z.array(z.string()).safeParse(req.body.entryIds ?? []);
      if (!entryIds.success || entryIds.data.length === 0) {
        sendError(res, 400, "invalid_request", "Explicit entry selection required.");
        return;
      }
      res.json({ packId: pack.id, rehydratedEntries: entryIds.data });
    })
  );

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logEvent("api_error", { errorCode: "internal" });
    sendError(res, 500, "internal_error", "Unexpected error.");
  });

  return { app, context: { driveClient, googleApi, openaiClient, prisma } };
};
