const hasKeyring = () =>
  Boolean(
    process.env.ENCRYPTION_KEYRING_JSON ||
      (process.env.ENCRYPTION_KEY_BASE64 && process.env.KEY_VERSION)
  );

export const validateRequiredEnv = () => {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const missing: string[] = [];

  if (!hasKeyring()) {
    missing.push("ENCRYPTION_KEYRING_JSON (or ENCRYPTION_KEY_BASE64 + KEY_VERSION)");
  }

  if (!process.env.DATABASE_URL) {
    missing.push("DATABASE_URL");
  }

  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    missing.push("SESSION_SECRET");
  }

  if (process.env.GOOGLE_API_STUB !== "1") {
    if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
      missing.push("GOOGLE_OAUTH_CLIENT_ID");
    }
    if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
      missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
    }
    if (!process.env.GOOGLE_OAUTH_REDIRECT_URI) {
      missing.push("GOOGLE_OAUTH_REDIRECT_URI");
    }
  }

  if (process.env.OPENAI_STUB !== "1" && !process.env.OPENAI_API_KEY) {
    missing.push("OPENAI_API_KEY");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
};
