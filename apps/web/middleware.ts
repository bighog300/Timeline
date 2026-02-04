import { NextResponse, type NextRequest } from "next/server";

import {
  CSRF_COOKIE_NAME,
  createCsrfToken,
  getCsrfCookieOptions,
} from "./src/shared/csrf";

export const middleware = (request: NextRequest) => {
  const response = NextResponse.next();
  const existing = request.cookies.get(CSRF_COOKIE_NAME)?.value;

  if (!existing) {
    response.cookies.set(CSRF_COOKIE_NAME, createCsrfToken(), {
      ...getCsrfCookieOptions(),
    });
  }

  return response;
};

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
