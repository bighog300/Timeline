import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getEnv } from "../../../../../src/env";
import { prisma } from "../../../../../src/server/db/prisma";
import { createSession } from "../../../../../src/server/auth/session";
import { encryptString } from "../../../../../src/server/crypto/encryption";
import { ValidationError } from "../../../../../src/server/errors";
import { withApiHandler } from "../../../../../src/server/http";

const STATE_COOKIE_NAME = "__Host-timeline-google-oauth-state";

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
  name?: string;
  picture?: string;
};

const exchangeCodeForToken = async (code: string) => {
  const env = getEnv();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as GoogleTokenResponse;
};

const fetchGoogleUser = async (accessToken: string) => {
  const response = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as GoogleUserInfo;
};

export const GET = withApiHandler(
  "/api/auth/google/callback",
  async ({ request, setUserId }) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = cookies().get(STATE_COOKIE_NAME)?.value;

    if (!code || !state || !storedState || state !== storedState) {
      throw new ValidationError("Invalid OAuth state.");
    }

    cookies().set(STATE_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    const env = getEnv();
    const redirectUrl = new URL(env.GOOGLE_OAUTH_REDIRECT_URI);
    const baseUrl = new URL(env.APP_BASE_URL);

    if (redirectUrl.origin !== baseUrl.origin) {
      throw new ValidationError("OAuth redirect URI mismatch.");
    }

    const tokenResponse = await exchangeCodeForToken(code);
    if (!tokenResponse?.access_token) {
      throw new ValidationError("OAuth token exchange failed.");
    }

    const userInfo = await fetchGoogleUser(tokenResponse.access_token);
    if (!userInfo?.email) {
      throw new ValidationError("Unable to fetch Google profile.");
    }

    const user = await prisma.user.upsert({
      where: {
        email: userInfo.email,
      },
      update: {
        name: userInfo.name ?? undefined,
        image: userInfo.picture ?? undefined,
      },
      create: {
        email: userInfo.email,
        name: userInfo.name ?? null,
        image: userInfo.picture ?? null,
      },
    });
    setUserId(user.id);

    const tokenExpiry = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000)
      : null;
    const scopes = tokenResponse.scope ?? env.GOOGLE_OAUTH_SCOPES;

    if (tokenResponse.refresh_token) {
      await prisma.driveConnection.upsert({
        where: {
          userId_provider: {
            userId: user.id,
            provider: "google",
          },
        },
        update: {
          scopes,
          refreshTokenEncrypted: encryptString(tokenResponse.refresh_token),
          accessTokenEncrypted: tokenResponse.access_token
            ? encryptString(tokenResponse.access_token)
            : undefined,
          tokenExpiry: tokenExpiry ?? undefined,
        },
        create: {
          userId: user.id,
          provider: "google",
          scopes,
          refreshTokenEncrypted: encryptString(tokenResponse.refresh_token),
          accessTokenEncrypted: tokenResponse.access_token
            ? encryptString(tokenResponse.access_token)
            : undefined,
          tokenExpiry: tokenExpiry ?? undefined,
        },
      });
    } else if (tokenResponse.access_token) {
      await prisma.driveConnection.updateMany({
        where: {
          userId: user.id,
          provider: "google",
        },
        data: {
          scopes,
          accessTokenEncrypted: encryptString(tokenResponse.access_token),
          tokenExpiry: tokenExpiry ?? undefined,
        },
      });
    }

    await createSession(user.id);

    return NextResponse.redirect(new URL("/", env.APP_BASE_URL));
  },
);
