import { cookies } from "next/headers";

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../../shared/csrf";
import { CsrfError } from "../errors";

export const assertCsrfToken = async (request: Request) => {
  const cookieToken = cookies().get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  let token = headerToken ?? null;

  if (!token) {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.clone().formData();
      const formToken = formData.get("csrfToken");
      token = typeof formToken === "string" ? formToken : null;
    }
  }

  if (!cookieToken || !token || cookieToken !== token) {
    throw new CsrfError();
  }
};
