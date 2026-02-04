import { withApiHandler } from "../../../src/server/http";

export const GET = withApiHandler("/api/health", async () =>
  Response.json({ ok: true }),
);
