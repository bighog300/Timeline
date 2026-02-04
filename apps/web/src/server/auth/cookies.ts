import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "__Host-timeline-session";

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

export const setSessionCookie = (sessionId: string, expiresAt: Date) => {
  cookies().set(SESSION_COOKIE_NAME, sessionId, {
    ...getCookieOptions(),
    expires: expiresAt,
  });
};

export const getSessionId = (): string | null => {
  return cookies().get(SESSION_COOKIE_NAME)?.value ?? null;
};

export const clearSessionCookie = () => {
  cookies().set(SESSION_COOKIE_NAME, "", {
    ...getCookieOptions(),
    maxAge: 0,
  });
};
