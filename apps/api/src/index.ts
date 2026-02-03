import crypto from "crypto";
import express from "express";
import session from "express-session";
import { z } from "zod";

const app = express();
app.use(express.json());

const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string()
});

type SessionData = z.infer<typeof SessionSchema>;

type EntryRecord = {
  id: string;
  userId: string;
  title: string;
  status: "processing" | "ready" | "error";
  driveWriteStatus: "ok" | "pending" | "failed";
  driveFileId: string | null;
  summaryMarkdown: string | null;
  keyPoints: string[];
  metadataRefs: string[];
  createdAt: string;
  updatedAt: string;
};

type TokenRecord = {
  userId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  keyVersion: string;
  expiresAt: string;
};

type PromptRecord = {
  id: string;
  key: string;
  version: number;
  content: string;
  active: boolean;
  userSelectable: boolean;
  createdAt: string;
};

type IndexPackRecord = {
  id: string;
  userId: string;
  driveFileId: string | null;
  status: "pending" | "ready" | "error";
  createdAt: string;
};

const entries = new Map<string, EntryRecord>();
const tokens = new Map<string, TokenRecord>();
const prompts = new Map<string, PromptRecord>();
const indexPacks = new Map<string, IndexPackRecord>();

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const keyring = (() => {
  const raw = process.env.TOKEN_ENCRYPTION_KEYRING ?? "[]";
  const parsed = z
    .array(z.object({ version: z.string(), key: z.string() }))
    .parse(JSON.parse(raw));
  return parsed;
})();

const activeKey = keyring[0];

const logEvent = (name: string, data: Record<string, number | string>) => {
  const payload = { name, ...data };
  console.log(JSON.stringify(payload));
};

const encrypt = (plaintext: string, keyVersion: string) => {
  const keyEntry = keyring.find((entry) => entry.version === keyVersion);
  if (!keyEntry) {
    throw new Error("missing_key_version");
  }
  const key = Buffer.from(keyEntry.key, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

const decrypt = (payload: string, keyVersion: string) => {
  const keyEntry = keyring.find((entry) => entry.version === keyVersion);
  if (!keyEntry) {
    throw new Error("missing_key_version");
  }
  const key = Buffer.from(keyEntry.key, "base64");
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};

const requireSession = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const sessionData = req.session?.user as SessionData | undefined;
  if (!sessionData) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
};

const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const sessionData = req.session?.user as SessionData | undefined;
  if (!sessionData || !adminEmails.has(sessionData.email)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
};

app.use(
  session({
    secret: process.env.SESSION_SECRET ?? "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" }
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/auth/google/start", (_req, res) => {
  res.json({ url: "https://accounts.google.com/o/oauth2/v2/auth" });
});

app.get("/auth/google/callback", (req, res) => {
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const email = req.query.email?.toString() ?? "user@example.com";
  req.session.user = { id: crypto.randomUUID(), userId, email } as SessionData;

  if (!activeKey) {
    res.status(500).json({ error: "missing_keyring" });
    return;
  }

  tokens.set(userId, {
    userId,
    encryptedAccessToken: encrypt("access-token", activeKey.version),
    encryptedRefreshToken: encrypt("refresh-token", activeKey.version),
    keyVersion: activeKey.version,
    expiresAt: now
  });

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
  const sessionData = req.session.user as SessionData;
  const items = Array.from(entries.values()).filter((entry) => entry.userId === sessionData.userId);
  res.json({ entries: items });
});

app.post("/entries", requireSession, (req, res) => {
  const sessionData = req.session.user as SessionData;
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
  entries.set(id, entry);
  res.status(201).json(entry);
});

app.get("/entries/:id", requireSession, (req, res) => {
  const sessionData = req.session.user as SessionData;
  const entry = entries.get(req.params.id);
  if (!entry || entry.userId !== sessionData.userId) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(entry);
});

app.post("/entries/:id/run", requireSession, (req, res) => {
  const sessionData = req.session.user as SessionData;
  const entry = entries.get(req.params.id);
  if (!entry || entry.userId !== sessionData.userId) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const token = tokens.get(sessionData.userId);
  if (!token) {
    res.status(401).json({ error: "reconnect_required" });
    return;
  }
  const start = Date.now();
  void decrypt(token.encryptedAccessToken, token.keyVersion);

  entry.status = "ready";
  entry.summaryMarkdown = "# Summary\n\nDerived summary output.";
  entry.keyPoints = ["Derived key point"];
  entry.metadataRefs = ["gmail:thread/123", "drive:file/456"];
  entry.driveFileId = entry.driveFileId ?? `drive-file-${entry.id}`;
  entry.driveWriteStatus = "ok";
  entry.updatedAt = new Date().toISOString();
  entries.set(entry.id, entry);

  logEvent("summary_run", {
    entryCount: 1,
    durationMs: Date.now() - start,
    errorCode: 0
  });

  res.json(entry);
});

app.get("/admin/prompts", requireSession, requireAdmin, (_req, res) => {
  res.json({ prompts: Array.from(prompts.values()) });
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
  prompts.set(id, prompt);
  res.status(201).json(prompt);
});

app.patch("/admin/prompts/:id/activate", requireSession, requireAdmin, (req, res) => {
  const target = prompts.get(req.params.id);
  if (!target) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  for (const prompt of prompts.values()) {
    if (prompt.key === target.key) {
      prompt.active = false;
    }
  }
  target.active = true;
  prompts.set(target.id, target);
  res.json(target);
});

app.post("/admin/playground", requireSession, requireAdmin, (_req, res) => {
  res.json({ output: "Playground output", usage: { promptTokens: 0, completionTokens: 0 } });
});

app.post("/index-packs", requireSession, (req, res) => {
  const sessionData = req.session.user as SessionData;
  const id = crypto.randomUUID();
  const pack: IndexPackRecord = {
    id,
    userId: sessionData.userId,
    driveFileId: `drive-pack-${id}`,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  indexPacks.set(id, pack);
  res.status(201).json(pack);
});

app.post("/index-packs/:id/run", requireSession, (req, res) => {
  const sessionData = req.session.user as SessionData;
  const pack = indexPacks.get(req.params.id);
  if (!pack || pack.userId !== sessionData.userId) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  pack.status = "ready";
  indexPacks.set(pack.id, pack);
  res.json(pack);
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  logEvent("api_started", { port });
});

