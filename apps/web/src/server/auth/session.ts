import { prisma } from "../db/prisma";
import { AuthError } from "../errors";
import { clearSessionCookie, getSessionId, setSessionCookie } from "./cookies";

const SESSION_TTL_DAYS = 30;

const getSessionExpiration = () => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt;
};

export const createSession = async (userId: string) => {
  const sessionId = crypto.randomUUID();
  const expiresAt = getSessionExpiration();

  const session = await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      expiresAt,
    },
  });

  setSessionCookie(session.id, session.expiresAt);
  return session;
};

export const getCurrentUser = async () => {
  const sessionId = getSessionId();
  if (!sessionId) {
    return null;
  }

  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });

  if (!session) {
    await destroySession(sessionId);
    return null;
  }

  return session.user;
};

export const requireCurrentUser = async () => {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError();
  }
  return user;
};

export const destroySession = async (sessionId?: string | null) => {
  const id = sessionId ?? getSessionId();
  if (!id) {
    clearSessionCookie();
    return;
  }

  await prisma.session.deleteMany({
    where: {
      id,
    },
  });

  clearSessionCookie();
};
