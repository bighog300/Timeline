import { z } from "zod";

const envSchema = z.object({
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url(),
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
