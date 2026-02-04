import { NextResponse } from "next/server";

import { requireCurrentUser } from "../../../../src/server/auth/session";
import { ensureDriveIndexingEnabled } from "../../../../src/server/featureFlags";
import { withApiHandler } from "../../../../src/server/http";
import { assertCsrfToken } from "../../../../src/server/security/csrf";
import { assertWithinAllQuotas } from "../../../../src/server/usage";
import { ingestDriveFiles } from "../../../../src/server/ingest/ingest";

export const POST = withApiHandler("/api/ingest/run", async ({ request, requestId, setUserId }) => {
  await assertCsrfToken(request);
  ensureDriveIndexingEnabled();

  const user = await requireCurrentUser();
  setUserId(user.id);
  await assertWithinAllQuotas(user.id);

  const summary = await ingestDriveFiles(user.id, requestId);
  return NextResponse.json(summary);
});
