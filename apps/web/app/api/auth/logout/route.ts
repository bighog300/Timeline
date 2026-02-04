import { NextResponse } from "next/server";

import { destroySession } from "../../../../../src/server/auth/session";
import { getEnv } from "../../../../../src/env";

export const POST = async () => {
  await destroySession();
  const env = getEnv();
  return NextResponse.redirect(new URL("/", env.APP_BASE_URL));
};
