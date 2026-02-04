import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getEnv } from "../../../../../src/env";

const STATE_COOKIE_NAME = "__Host-timeline-google-oauth-state";
const STATE_TTL_SECONDS = 300;

const buildGoogleAuthUrl = (state: string) => {
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
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  return url.toString();
};

export const GET = async () => {
  try {
    const state = crypto.randomUUID();

    cookies().set(STATE_COOKIE_NAME, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: STATE_TTL_SECONDS,
    });

    const authUrl = buildGoogleAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to start OAuth flow." },
      { status: 500 },
    );
  }
};
