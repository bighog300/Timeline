import session from "express-session";
import { db, saveDb } from "./db";
import type { SessionRecord } from "./types";

const sessionTtlMs = Number(process.env.SESSION_TTL_MS ?? 1000 * 60 * 60 * 24 * 7);

const buildExpiresAt = (sessionData: session.SessionData) => {
  if (sessionData.cookie?.expires) {
    return new Date(sessionData.cookie.expires).toISOString();
  }
  return new Date(Date.now() + sessionTtlMs).toISOString();
};

export const createSessionStore = () => {
  class DbSessionStore extends session.Store {
    get(sid: string, callback: (err: Error | null, session?: session.SessionData | null) => void) {
      const record = db.sessions[sid];
      if (!record) {
        callback(null, null);
        return;
      }
      if (new Date(record.expiresAt).getTime() <= Date.now()) {
        delete db.sessions[sid];
        saveDb();
        callback(null, null);
        return;
      }
      callback(null, record.data as session.SessionData);
    }

    set(sid: string, sessionData: session.SessionData, callback?: (err?: Error | null) => void) {
      const now = new Date().toISOString();
      const record: SessionRecord = {
        id: sid,
        data: sessionData as Record<string, unknown>,
        expiresAt: buildExpiresAt(sessionData),
        createdAt: now
      };
      db.sessions[sid] = record;
      saveDb();
      callback?.(null);
    }

    destroy(sid: string, callback?: (err?: Error | null) => void) {
      delete db.sessions[sid];
      saveDb();
      callback?.(null);
    }

    touch(sid: string, sessionData: session.SessionData, callback?: () => void) {
      const record = db.sessions[sid];
      if (record) {
        record.expiresAt = buildExpiresAt(sessionData);
        db.sessions[sid] = record;
        saveDb();
      }
      callback?.();
    }
  }

  return new DbSessionStore();
};

export const cleanupExpiredSessions = () => {
  const now = Date.now();
  let removed = 0;
  for (const [sid, record] of Object.entries(db.sessions)) {
    if (new Date(record.expiresAt).getTime() <= now) {
      delete db.sessions[sid];
      removed += 1;
    }
  }
  if (removed > 0) {
    saveDb();
  }
  return removed;
};

export const getSessionTtlMs = () => sessionTtlMs;
