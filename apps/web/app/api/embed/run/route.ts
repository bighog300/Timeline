import { NextResponse } from "next/server";
import { z } from "zod";

import { getEnv } from "../../../../src/env";
import { requireCurrentUser } from "../../../../src/server/auth/session";
import { ensureEmbeddingsEnabled } from "../../../../src/server/featureFlags";
import { withApiHandler } from "../../../../src/server/http";
import { assertCsrfToken } from "../../../../src/server/security/csrf";
import { assertEmbedQuota, recordEmbedUsage } from "../../../../src/server/usage";
import { runEmbeddingPipeline } from "../../../../src/server/embeddings/pipeline";

const embedRequestSchema = z.object({
  driveFileRefId: z.string().uuid().optional(),
});

export const POST = withApiHandler("/api/embed/run", async ({ request, requestId, setUserId }) => {
  await assertCsrfToken(request);
  ensureEmbeddingsEnabled();

  const user = await requireCurrentUser();
  setUserId(user.id);

  const payload = embedRequestSchema.parse(await request.json().catch(() => ({})));

  const env = getEnv();
  const remaining = await assertEmbedQuota(user.id, 1);
  const maxChunks = Math.min(env.EMBED_MAX_CHUNKS_PER_RUN, remaining);
  const summary = await runEmbeddingPipeline(user.id, {
    driveFileRefId: payload.driveFileRefId,
    maxChunks,
    requestId,
  });

  await recordEmbedUsage(user.id, summary.embeddedChunks);

  return NextResponse.json(summary);
});
