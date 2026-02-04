import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getEnv } from "../../../../../src/env";
import { prisma } from "../../../../../src/server/db/prisma";
import { getCurrentUser } from "../../../../../src/server/auth/session";
import { withApiHandler } from "../../../../../src/server/http";

const STATE_COOKIE_NAME = "__Host-timeline-google-oauth-state";
const STATE_TTL_SECONDS = 300;

const buildGoogleAuthUrl = async (state: string, userId?: string | null) => {
  const env = getEnv();
  const redirectUrl = new URL(env.GOOGLE_OAUTH_REDIRECT_URI);
  const baseUrl = new URL(env.APP_BASE_URL);

  if (redirectUrl.origin !== baseUrl.origin) {
    throw new Error("OAuth redirect URI must match APP_BASE_URL origin.");
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GOOGLE_OAUTH_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  const scopes = env.GOOGLE_OAUTH_SCOPES.split(",")
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(" ");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);

  const existingConnection = userId
    ? await prisma.driveConnection.findFirst({
        where: {
          userId,
          provider: "google",
        },
      })
    : null;

  if (!existingConnection?.refreshTokenEncrypted) {
    // Prompt for consent only when we still need a refresh token.
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }

  return url.toString();
};

export const GET = withApiHandler("/api/auth/google/start", async ({ setUserId }) => {
  const state = crypto.randomUUID();

  cookies().set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });

  const currentUser = await getCurrentUser();
  if (currentUser) {
    setUserId(currentUser.id);
  }

  const authUrl = await buildGoogleAuthUrl(state, currentUser?.id);
  return NextResponse.redirect(authUrl);
});
