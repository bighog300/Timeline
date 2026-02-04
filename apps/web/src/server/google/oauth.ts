import { getEnv } from "../../env";
import { ExternalApiError } from "../errors";
import { prisma } from "../db/prisma";
import { decryptString, encryptString } from "../crypto/encryption";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

type RefreshTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

const refreshAccessToken = async (refreshToken: string) => {
  const env = getEnv();
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new ExternalApiError("Failed to refresh Google access token.");
  }

  return (await response.json()) as RefreshTokenResponse;
};

export const getDriveConnection = async (userId: string) => {
  return prisma.driveConnection.findFirst({
    where: {
      userId,
      provider: "google",
    },
  });
};

export const getGoogleDriveAccessToken = async (userId: string) => {
  const connection = await getDriveConnection(userId);
  if (!connection) {
    return null;
  }

  if (
    connection.accessTokenEncrypted &&
    connection.tokenExpiry &&
    connection.tokenExpiry.getTime() - Date.now() > TOKEN_EXPIRY_BUFFER_MS
  ) {
    return decryptString(connection.accessTokenEncrypted);
  }

  const refreshToken = decryptString(connection.refreshTokenEncrypted);
  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed.access_token || !refreshed.expires_in) {
    throw new ExternalApiError("Google token refresh returned no access token.");
  }

  const tokenExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
  await prisma.driveConnection.update({
    where: {
      id: connection.id,
    },
    data: {
      accessTokenEncrypted: encryptString(refreshed.access_token),
      tokenExpiry,
      scopes: refreshed.scope ?? connection.scopes,
    },
  });

  return refreshed.access_token;
};
