import fs from "fs";
import path from "path";
import type {
  DriveFile,
  DriveFolder,
  EntryRecord,
  IndexPackRecord,
  PromptRecord,
  SessionRecord,
  TokenRecord
} from "./types";

export type Database = {
  sessions: Record<string, SessionRecord>;
  tokens: Record<string, TokenRecord>;
  entries: Record<string, EntryRecord>;
  prompts: Record<string, PromptRecord>;
  indexPacks: Record<string, IndexPackRecord>;
  drive: {
    folders: Record<string, DriveFolder>;
    files: Record<string, DriveFile>;
  };
};

const defaultDbPath = process.env.DB_PATH ?? path.join(process.cwd(), "data", "timeline-db.json");
const dataDir = path.dirname(defaultDbPath);

const ensureDataDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

const emptyDb = (): Database => {
  const now = new Date().toISOString();
  return {
    sessions: {},
    tokens: {},
    entries: {},
    prompts: {},
    indexPacks: {},
    drive: {
      folders: {
        root: {
          id: "root",
          name: "root",
          parentId: null,
          createdAt: now
        }
      },
      files: {}
    }
  };
};

const loadDb = (): Database => {
  ensureDataDir();
  if (!fs.existsSync(defaultDbPath)) {
    return emptyDb();
  }
  try {
    const raw = fs.readFileSync(defaultDbPath, "utf8");
    const parsed = JSON.parse(raw) as Database;
    if (!parsed.drive?.folders?.root) {
      const base = emptyDb();
      return { ...base, ...parsed, drive: { ...base.drive, ...parsed.drive } };
    }
    return parsed;
  } catch {
    return emptyDb();
  }
};

export const db = loadDb();

export const saveDb = () => {
  ensureDataDir();
  fs.writeFileSync(defaultDbPath, JSON.stringify(db, null, 2));
};
