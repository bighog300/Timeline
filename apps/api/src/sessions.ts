import session from "express-session";
import type { PrismaClient } from "@prisma/client";
import type { SessionData } from "./types";

const sessionTtlMs = Number(process.env.SESSION_TTL_MS ?? 1000 * 60 * 60 * 24 * 7);
const minSessionSecretLength = 32;

export const getSessionSecret = () => {
  const rawSecret = process.env.SESSION_SECRET ?? "";
  const normalizedSecret = rawSecret.trim();
  const isProduction = process.env.NODE_ENV === "production";
  const isValid =
    normalizedSecret.length >= minSessionSecretLength && normalizedSecret !== "dev-secret";

  if (isProduction) {
    if (!isValid) {
      throw new Error(
        "Production requires SESSION_SECRET (>= 32 chars) and must not be 'dev-secret'."
      );
    }
    return normalizedSecret;
  }

  return normalizedSecret || "dev-secret";
};

const buildExpiresAt = (sessionData: session.SessionData) => {
  if (sessionData.cookie?.expires) {
    return new Date(sessionData.cookie.expires);
  }
  return new Date(Date.now() + sessionTtlMs);
};

const extractUserId = (sessionData: session.SessionData) => {
  const user = sessionData.user as SessionData | undefined;
  return user?.userId ?? null;
};

export const createSessionStore = (prisma: PrismaClient) => {
  class DbSessionStore extends session.Store {
    get(sid: string, callback: (err: Error | null, session?: session.SessionData | null) => void) {
      prisma.session
        .findUnique({ where: { id: sid } })
        .then((record: any) => {
          if (!record) {
            callback(null, null);
            return;
          }
          if (record.expiresAt.getTime() <= Date.now()) {
            return prisma.session.delete({ where: { id: sid } }).then(() => callback(null, null));
          }
          callback(null, record.data as session.SessionData);
        })
        .catch((error: unknown) => callback(error as Error));
    }

    set(sid: string, sessionData: session.SessionData, callback?: (err?: Error | null) => void) {
      const expiresAt = buildExpiresAt(sessionData);
      const userId = extractUserId(sessionData);
      prisma.session
        .upsert({
          where: { id: sid },
          create: {
            id: sid,
            userId,
            data: sessionData as Record<string, unknown>,
            expiresAt
          },
          update: {
            userId,
            data: sessionData as Record<string, unknown>,
            expiresAt
          }
        })
        .then(() => callback?.(null))
        .catch((error: unknown) => callback?.(error as Error));
    }

    destroy(sid: string, callback?: (err?: Error | null) => void) {
      prisma.session
        .delete({ where: { id: sid } })
        .then(() => callback?.(null))
        .catch((error: unknown) => callback?.(error as Error));
    }

    touch(sid: string, sessionData: session.SessionData, callback?: () => void) {
      const expiresAt = buildExpiresAt(sessionData);
      const userId = extractUserId(sessionData);
      prisma.session
        .update({
          where: { id: sid },
          data: { expiresAt, userId, data: sessionData as Record<string, unknown> }
        })
        .then(() => callback?.())
        .catch(() => callback?.());
    }
  }

  return new DbSessionStore();
};

export const cleanupExpiredSessions = async (prisma: PrismaClient) => {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
  return result.count;
};

export const getSessionTtlMs = () => sessionTtlMs;
