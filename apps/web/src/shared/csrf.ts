export const CSRF_COOKIE_NAME = "__Host-timeline-csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

export const createCsrfToken = () => crypto.randomUUID();

export const getCsrfCookieOptions = () => ({
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});
