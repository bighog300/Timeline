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
import { logEvent } from "./logger";
import { cleanupExpiredSessions, createSessionStore, getSessionTtlMs } from "./sessions";
import type {
  EntryRecord,
  IndexPackRecord,
  SessionData,
  TokenRecord
} from "./types";

const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string()
});

type AppContext = {
  driveClient: DriveClient;
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

export const createApp = (options: Partial<AppContext> = {}) => {
  const app = express();
  const driveClient = options.driveClient ?? createDriveClient();
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
      secret: process.env.SESSION_SECRET ?? "dev-secret",
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

  const writeEntryToDrive = async (entry: EntryRecord) => {
    const { summariesFolderId } = await driveClient.ensureTimelineFolders();
    const markdown = entry.summaryMarkdown ?? "";
    if (entry.driveFileId) {
      await driveClient.updateFile({ fileId: entry.driveFileId, content: markdown });
      return entry.driveFileId;
    }
    const file = await driveClient.createFile({
      name: `${entry.title}-${entry.id}.md`,
      parentId: summariesFolderId,
      content: markdown,
      mimeType: "text/markdown"
    });
    return file.id;
  };

  const writeIndexPackToDrive = async (pack: IndexPackRecord, content: string) => {
    const { indexesFolderId } = await driveClient.ensureTimelineFolders();
    if (pack.driveFileId) {
      await driveClient.updateFile({ fileId: pack.driveFileId, content });
      return pack.driveFileId;
    }
    const file = await driveClient.createFile({
      name: `index-pack-${pack.id}.md`,
      parentId: indexesFolderId,
      content,
      mimeType: "text/markdown"
    });
    return file.id;
  };

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/auth/google/start", (_req, res) => {
    res.json({ url: "https://accounts.google.com/o/oauth2/v2/auth" });
  });

  app.get(
    "/auth/google/callback",
    handleAsync(async (req, res) => {
      const activeKeyVersion = getActiveKeyVersion();
      if (!activeKeyVersion) {
        sendError(res, 500, "missing_keyring", "Token keyring not configured.");
        return;
      }

      const now = new Date();
      const email = req.query.email?.toString() ?? "user@example.com";
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email }
      });

      req.session.user = { id: crypto.randomUUID(), userId: user.id, email } as SessionData;

      const accessToken = encryptPayload("access-token", activeKeyVersion);
      const refreshToken = encryptPayload("refresh-token", activeKeyVersion);

      const tokenRecord: TokenRecord = {
        userId: user.id,
        encryptedAccessToken: accessToken.ciphertext,
        accessTokenIv: accessToken.iv,
        accessTokenAuthTag: accessToken.authTag,
        encryptedRefreshToken: refreshToken.ciphertext,
        refreshTokenIv: refreshToken.iv,
        refreshTokenAuthTag: refreshToken.authTag,
        keyVersion: activeKeyVersion,
        expiresAt: now.toISOString()
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
          expiresAt: now
        },
        update: {
          accessCiphertext: tokenRecord.encryptedAccessToken,
          accessIv: tokenRecord.accessTokenIv,
          accessAuthTag: tokenRecord.accessTokenAuthTag,
          refreshCiphertext: tokenRecord.encryptedRefreshToken,
          refreshIv: tokenRecord.refreshTokenIv,
          refreshAuthTag: tokenRecord.refreshTokenAuthTag,
          keyVersion: tokenRecord.keyVersion,
          expiresAt: now
        }
      });

      res.json({ ok: true });
    })
  );

  app.post("/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.get("/search/gmail", requireSession, (_req, res) => {
    res.json({ results: [], source: "gmail", metadataOnly: true });
  });

  app.get("/search/drive", requireSession, (_req, res) => {
    res.json({ results: [], source: "drive", metadataOnly: true });
  });

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
      const now = new Date();
      const entry = await prisma.timelineEntry.create({
        data: {
          id: crypto.randomUUID(),
          userId: sessionData.userId,
          title: req.body.title ?? "Untitled",
          status: "processing",
          driveWriteStatus: "pending",
          driveFileId: null,
          summaryMarkdown: null,
          keyPoints: [],
          metadataRefs: [],
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
      const entry = await prisma.timelineEntry.findUnique({ where: { id: req.params.id } });
      if (!entry || entry.userId !== sessionData.userId) {
        sendError(res, 404, "not_found", "Entry not found.");
        return;
      }
      res.json(entry);
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

      const token = await prisma.googleTokenSet.findUnique({ where: { userId: sessionData.userId } });
      if (!token) {
        sendError(res, 401, "reconnect_required", "Re-authentication required.");
        return;
      }

      const start = Date.now();
      void decryptPayload({
        ciphertext: token.accessCiphertext,
        iv: token.accessIv,
        authTag: token.accessAuthTag,
        keyVersion: token.keyVersion
      });

      let updatedEntry = await prisma.timelineEntry.update({
        where: { id: entry.id },
        data: {
          status: "ready",
          summaryMarkdown: "# Summary\n\nDerived summary output.",
          keyPoints: ["Derived key point"],
          metadataRefs: ["gmail:thread/123", "drive:file/456"],
          driveWriteStatus: "pending"
        }
      });

      try {
        const driveFileId = await writeEntryToDrive(updatedEntry as EntryRecord);
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

  app.post(
    "/entries/:id/drive-retry",
    requireSession,
    handleAsync(async (req, res) => {
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

      let updatedEntry = await prisma.timelineEntry.update({
        where: { id: entry.id },
        data: { driveWriteStatus: "pending" }
      });

      try {
        const driveFileId = await writeEntryToDrive(updatedEntry as EntryRecord);
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
    })
  );

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
          active: false,
          userSelectable: Boolean(req.body.userSelectable ?? true),
          createdAt: new Date()
        }
      });
      res.status(201).json(prompt);
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

  app.post("/admin/playground", requireSession, requireAdmin, (_req, res) => {
    res.json({ output: "Playground output", usage: { promptTokens: 0, completionTokens: 0 } });
  });

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

      const entryCount = await prisma.timelineEntry.count({ where: { userId: sessionData.userId } });
      const content = `# Index Pack\n\nEntry count: ${entryCount}`;

      let updatedPack = await prisma.indexPack.update({
        where: { id: pack.id },
        data: { status: "pending" }
      });

      try {
        const driveFileId = await writeIndexPackToDrive(updatedPack as IndexPackRecord, content);
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

  return { app, context: { driveClient, prisma } };
};
