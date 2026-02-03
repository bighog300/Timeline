import crypto from "crypto";
import express from "express";
import session from "express-session";
import { z } from "zod";
import { db, saveDb } from "./db";
import { decryptPayload, encryptPayload, getActiveKeyVersion } from "./crypto";
import { createDriveClient } from "./drive";
import { sendError } from "./errors";
import { logEvent } from "./logger";
import { cleanupExpiredSessions, createSessionStore, getSessionTtlMs } from "./sessions";
import type {
  EntryRecord,
  IndexPackRecord,
  PromptRecord,
  SessionData,
  TokenRecord
} from "./types";

const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string()
});

type AppContext = {
  driveClient: ReturnType<typeof createDriveClient>;
};

const ensureSessionData = (req: express.Request) => {
  const sessionData = req.session?.user as SessionData | undefined;
  const parsed = SessionSchema.safeParse(sessionData);
  return parsed.success ? parsed.data : null;
};

export const createApp = (options: Partial<AppContext> = {}) => {
  const app = express();
  const driveClient = options.driveClient ?? createDriveClient();

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
      store: createSessionStore(),
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

  const persistEntry = (entry: EntryRecord) => {
    db.entries[entry.id] = entry;
    saveDb();
  };

  const writeEntryToDrive = (entry: EntryRecord) => {
    const { summariesFolderId } = driveClient.ensureTimelineFolders();
    const markdown = entry.summaryMarkdown ?? "";
    if (entry.driveFileId) {
      driveClient.updateFile({ fileId: entry.driveFileId, content: markdown });
      return entry.driveFileId;
    }
    const file = driveClient.createFile({
      name: `${entry.title}-${entry.id}.md`,
      parentId: summariesFolderId,
      content: markdown,
      mimeType: "text/markdown"
    });
    return file.id;
  };

  const writeIndexPackToDrive = (pack: IndexPackRecord, content: string) => {
    const { rootFolderId } = driveClient.ensureTimelineFolders();
    if (pack.driveFileId) {
      driveClient.updateFile({ fileId: pack.driveFileId, content });
      return pack.driveFileId;
    }
    const file = driveClient.createFile({
      name: `index-pack-${pack.id}.md`,
      parentId: rootFolderId,
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

  app.get("/auth/google/callback", (req, res) => {
    const activeKeyVersion = getActiveKeyVersion();
    if (!activeKeyVersion) {
      sendError(res, 500, "missing_keyring", "Token keyring not configured.");
      return;
    }

    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const email = req.query.email?.toString() ?? "user@example.com";
    req.session.user = { id: crypto.randomUUID(), userId, email } as SessionData;

    const accessToken = encryptPayload("access-token", activeKeyVersion);
    const refreshToken = encryptPayload("refresh-token", activeKeyVersion);

    const tokenRecord: TokenRecord = {
      userId,
      encryptedAccessToken: accessToken.ciphertext,
      accessTokenIv: accessToken.iv,
      accessTokenAuthTag: accessToken.authTag,
      encryptedRefreshToken: refreshToken.ciphertext,
      refreshTokenIv: refreshToken.iv,
      refreshTokenAuthTag: refreshToken.authTag,
      keyVersion: activeKeyVersion,
      expiresAt: now
    };

    db.tokens[userId] = tokenRecord;
    saveDb();

    res.json({ ok: true });
  });

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

  app.get("/entries", requireSession, (req, res) => {
    const sessionData = ensureSessionData(req) as SessionData;
    const items = Object.values(db.entries).filter((entry) => entry.userId === sessionData.userId);
    res.json({ entries: items });
  });

  app.post("/entries", requireSession, (req, res) => {
    const sessionData = ensureSessionData(req) as SessionData;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const entry: EntryRecord = {
      id,
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
    };
    persistEntry(entry);
    res.status(201).json(entry);
  });

  app.get("/entries/:id", requireSession, (req, res) => {
    const sessionData = ensureSessionData(req) as SessionData;
    const entry = db.entries[req.params.id];
    if (!entry || entry.userId !== sessionData.userId) {
      sendError(res, 404, "not_found", "Entry not found.");
      return;
    }
    res.json(entry);
  });

  app.post("/entries/:id/run", requireSession, (req, res) => {
    const sessionData = ensureSessionData(req) as SessionData;
    const entry = db.entries[req.params.id];
    if (!entry || entry.userId !== sessionData.userId) {
      sendError(res, 404, "not_found", "Entry not found.");
      return;
    }
    const token = db.tokens[sessionData.userId];
    if (!token) {
      sendError(res, 401, "reconnect_required", "Re-authentication required.");
      return;
    }

    const start = Date.now();
    void decryptPayload({
      ciphertext: token.encryptedAccessToken,
      iv: token.accessTokenIv,
      authTag: token.accessTokenAuthTag,
      keyVersion: token.keyVersion
    });

    entry.status = "ready";
    entry.summaryMarkdown = "# Summary\n\nDerived summary output.";
    entry.keyPoints = ["Derived key point"];
    entry.metadataRefs = ["gmail:thread/123", "drive:file/456"];
    entry.updatedAt = new Date().toISOString();

    entry.driveWriteStatus = "pending";
    try {
      entry.driveFileId = writeEntryToDrive(entry);
      entry.driveWriteStatus = "ok";
    } catch {
      entry.driveWriteStatus = "failed";
    }

    persistEntry(entry);

    logEvent("summary_run", {
      entryCount: 1,
      durationMs: Date.now() - start,
      errorCode: 0,
      entryId: entry.id,
      userId: entry.userId,
      driveWriteStatus: entry.driveWriteStatus
    });

    res.json(entry);
  });

  app.post("/entries/:id/drive-retry", requireSession, (req, res) => {
    const sessionData = ensureSessionData(req) as SessionData;
    const entry = db.entries[req.params.id];
    if (!entry || entry.userId !== sessionData.userId) {
      sendError(res, 404, "not_found", "Entry not found.");
      return;
    }
    if (entry.driveWriteStatus === "ok") {
      res.json(entry);
      return;
    }
    entry.driveWriteStatus = "pending";
    try {
      entry.driveFileId = writeEntryToDrive(entry);
      entry.driveWriteStatus = "ok";
    } catch {
      entry.driveWriteStatus = "failed";
    }
    entry.updatedAt = new Date().toISOString();
    persistEntry(entry);
    res.json(entry);
  });

  app.get("/admin/prompts", requireSession, requireAdmin, (_req, res) => {
    res.json({ prompts: Object.values(db.prompts) });
  });

  app.post("/admin/prompts", requireSession, requireAdmin, (req, res) => {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const prompt: PromptRecord = {
      id,
      key: req.body.key ?? "default",
      version: Number(req.body.version ?? 1),
      content: req.body.content ?? "",
      active: false,
      userSelectable: Boolean(req.body.userSelectable ?? true),
      createdAt: now
    };
    db.prompts[id] = prompt;
    saveDb();
    res.status(201).json(prompt);
  });

  app.patch("/admin/prompts/:id/activate", requireSession, requireAdmin, (req, res) => {
    const target = db.prompts[req.params.id];
    if (!target) {
      sendError(res, 404, "not_found", "Prompt not found.");
      return;
    }
    for (const prompt of Object.values(db.prompts)) {
      if (prompt.key === target.key) {
        prompt.active = false;
      }
    }
    target.active = true;
    db.prompts[target.id] = target;
    saveDb();
    res.json(target);
  });

  app.post("/admin/playground", requireSession, requireAdmin, (_req, res) => {
    res.json({ output: "Playground output", usage: { promptTokens: 0, completionTokens: 0 } });
  });

  app.post("/admin/sessions/cleanup", requireSession, requireAdmin, (_req, res) => {
    const removed = cleanupExpiredSessions();
    res.json({ removed });
  });

  app.get("/index-packs", requireSession, (req, res) => {
    const sessionData = ensureSessionData(req) as SessionData;
    const packs = Object.values(db.indexPacks).filter((pack) => pack.userId === sessionData.userId);
    res.json({ packs });
  });

  app.get("/index-packs/:id", requireSession, (req, res) => {
    const sessionData = ensureSessionData(req) as SessionData;
    const pack = db.indexPacks[req.params.id];
    if (!pack || pack.userId !== sessionData.userId) {
      sendError(res, 404, "not_found", "Index pack not found.");
      return;
    }
    res.json(pack);
  });

  app.post("/index-packs", requireSession, (req, res) => {
    const sessionData = ensureSessionData(req) as SessionData;
    const id = crypto.randomUUID();
    const pack: IndexPackRecord = {
      id,
      userId: sessionData.userId,
      driveFileId: null,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    db.indexPacks[id] = pack;
    saveDb();
    res.status(201).json(pack);
  });

  app.patch("/index-packs/:id", requireSession, (req, res) => {
    const sessionData = ensureSessionData(req) as SessionData;
    const pack = db.indexPacks[req.params.id];
    if (!pack || pack.userId !== sessionData.userId) {
      sendError(res, 404, "not_found", "Index pack not found.");
      return;
    }
    pack.status = req.body.status ?? pack.status;
    db.indexPacks[pack.id] = pack;
    saveDb();
    res.json(pack);
  });

  app.post("/index-packs/:id/run", requireSession, (req, res) => {
    const sessionData = ensureSessionData(req) as SessionData;
    const pack = db.indexPacks[req.params.id];
    if (!pack || pack.userId !== sessionData.userId) {
      sendError(res, 404, "not_found", "Index pack not found.");
      return;
    }
    const content = `# Index Pack\n\nEntry count: ${Object.values(db.entries).filter((entry) => entry.userId === sessionData.userId).length}`;
    pack.status = "pending";
    try {
      pack.driveFileId = writeIndexPackToDrive(pack, content);
      pack.status = "ready";
    } catch {
      pack.status = "error";
    }
    db.indexPacks[pack.id] = pack;
    saveDb();
    res.json(pack);
  });

  app.post("/index-packs/:id/rehydrate", requireSession, (req, res) => {
    const sessionData = ensureSessionData(req) as SessionData;
    const pack = db.indexPacks[req.params.id];
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
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logEvent("api_error", { errorCode: "internal" });
    sendError(res, 500, "internal_error", "Unexpected error.");
  });

  return { app, context: { driveClient } };
};
