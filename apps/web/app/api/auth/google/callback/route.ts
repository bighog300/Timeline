import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getEnv } from "../../../../../src/env";
import { prisma } from "../../../../../src/server/db/prisma";
import { createSession } from "../../../../../src/server/auth/session";
import { encryptString } from "../../../../../src/server/crypto/encryption";

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

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = cookies().get(STATE_COOKIE_NAME)?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.json({ error: "Invalid OAuth state." }, { status: 400 });
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
    return NextResponse.json(
      { error: "OAuth redirect URI mismatch." },
      { status: 500 },
    );
  }

  const tokenResponse = await exchangeCodeForToken(code);
  if (!tokenResponse?.access_token) {
    return NextResponse.json(
      { error: "OAuth token exchange failed." },
      { status: 400 },
    );
  }

  const userInfo = await fetchGoogleUser(tokenResponse.access_token);
  if (!userInfo?.email) {
    return NextResponse.json(
      { error: "Unable to fetch Google profile." },
      { status: 400 },
    );
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
};
