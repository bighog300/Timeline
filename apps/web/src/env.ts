import { z } from "zod";

const envSchema = z.object({
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url(),
  GOOGLE_OAUTH_SCOPES: z
    .string()
    .default(
      "openid,email,profile,https://www.googleapis.com/auth/drive.readonly",
    ),
  GOOGLE_DRIVE_PAGE_SIZE: z.coerce.number().int().positive().default(100),
  INDEX_MAX_FILES_PER_RUN: z.coerce.number().int().positive().default(25),
  INDEX_MAX_BYTES_PER_RUN: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024),
  INDEX_MAX_CHUNKS_PER_FILE: z.coerce.number().int().positive().default(200),
  OPENAI_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export const getEnv = (): Env => {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    if (process.env.SKIP_ENV_VALIDATION === "true") {
      cachedEnv = process.env as Env;
      return cachedEnv;
    }

    const errorMessages = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Invalid environment variables: ${errorMessages}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
};
