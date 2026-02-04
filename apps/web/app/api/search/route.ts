import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "../../../src/server/auth/session";
import { ValidationError } from "../../../src/server/errors";
import { ensureEmbeddingsEnabled } from "../../../src/server/featureFlags";
import { withApiHandler } from "../../../src/server/http";
import { assertCsrfToken } from "../../../src/server/security/csrf";
import { assertSearchQuota, recordSearchUsage } from "../../../src/server/usage";
import { searchEmbeddings } from "../../../src/server/embeddings/pipeline";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const MAX_QUERY_CHARS = 2000;

const searchSchema = z.object({
  query: z.string().trim().min(1).max(MAX_QUERY_CHARS),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
});

export const POST = withApiHandler("/api/search", async ({ request, requestId, setUserId }) => {
  await assertCsrfToken(request);
  ensureEmbeddingsEnabled();

  const user = await requireCurrentUser();
  setUserId(user.id);

  const body = searchSchema.parse(
    await request.json().catch(() => {
      throw new ValidationError("Invalid request body.");
    }),
  );
  const limit = Math.min(MAX_LIMIT, Math.max(1, body.limit ?? DEFAULT_LIMIT));

  await assertSearchQuota(user.id, 1);

  const results = await searchEmbeddings(user.id, body.query, limit, requestId);
  await recordSearchUsage(user.id, 1);

  return NextResponse.json({
    results: results.map((row) => ({
      score: row.score,
      driveFileRefId: row.driveFileRefId,
      driveFileName: row.driveFileName,
      chunkIndex: row.chunkIndex,
      snippet: row.snippet,
      updatedAt: row.updatedAt,
    })),
  });
});
