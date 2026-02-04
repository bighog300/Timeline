import { NextResponse } from "next/server";

import { destroySession } from "../../../../../src/server/auth/session";
import { getEnv } from "../../../../../src/env";
import { withApiHandler } from "../../../../../src/server/http";
import { assertCsrfToken } from "../../../../../src/server/security/csrf";

export const POST = withApiHandler("/api/auth/logout", async ({ request }) => {
  await assertCsrfToken(request);
  await destroySession();
  const env = getEnv();
  return NextResponse.redirect(new URL("/", env.APP_BASE_URL));
});
