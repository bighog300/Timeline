import { CSRF_COOKIE_NAME } from "../shared/csrf";

const readCookieValue = (name: string) => {
  if (typeof document === "undefined") {
    return null;
  }
  return (
    document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${name}=`))
      ?.split("=")[1] ?? null
  );
};

export const getCsrfToken = () => readCookieValue(CSRF_COOKIE_NAME);
