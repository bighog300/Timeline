import { NextResponse } from "next/server";

import { requireCurrentUser } from "../../../../src/server/auth/session";
import { ValidationError } from "../../../../src/server/errors";
import { withApiHandler } from "../../../../src/server/http";
import { assertCsrfToken } from "../../../../src/server/security/csrf";
import { getDriveConnection } from "../../../../src/server/google/oauth";

export const POST = withApiHandler("/api/drive/connect", async ({ request, setUserId }) => {
  await assertCsrfToken(request);

  const user = await requireCurrentUser();
  setUserId(user.id);

  const connection = await getDriveConnection(user.id);
  if (!connection) {
    throw new ValidationError("Drive connection not found. Re-authenticate first.");
  }

  return NextResponse.json({ ok: true });
});
