import { NextResponse } from "next/server";
import { z } from "zod";

export type ErrorCode =
  | "auth_required"
  | "forbidden"
  | "quota_exceeded"
  | "validation_error"
  | "csrf_failed"
  | "feature_disabled"
  | "external_api_error"
  | "not_found"
  | "internal_error";

class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toResponseBody() {
    return {
      error: this.code,
      message: this.message,
      ...this.details,
    };
  }
}

export class AuthError extends AppError {
  constructor(message = "Unauthorized.") {
    super(message, "auth_required", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden.") {
    super(message, "forbidden", 403);
  }
}

export class CsrfError extends AppError {
  constructor() {
    super("CSRF validation failed.", "csrf_failed", 403);
  }
}

export class QuotaError extends AppError {
  constructor(limit: number, remaining: number) {
    super("Quota exceeded.", "quota_exceeded", 429, { limit, remaining });
  }
}

export class ExternalApiError extends AppError {
  constructor(message = "External API error.") {
    super(message, "external_api_error", 502);
  }
}

export class FeatureDisabledError extends AppError {
  constructor(feature: string) {
    super(`Feature "${feature}" is disabled.`, "feature_disabled", 503, {
      feature,
    });
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request.") {
    super(message, "validation_error", 400);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(message, "not_found", 404);
  }
}

export const getErrorCode = (error: unknown): ErrorCode => {
  if (error instanceof AppError) {
    return error.code;
  }
  if (error instanceof z.ZodError) {
    return "validation_error";
  }
  return "internal_error";
};

const sanitizeZodIssues = (error: z.ZodError) =>
  error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

export const toErrorResponse = (error: unknown, requestId?: string) => {
  const isProd = process.env.NODE_ENV === "production";

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        ...error.toResponseBody(),
        requestId,
      },
      { status: error.status },
    );
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: "validation_error",
        issues: sanitizeZodIssues(error),
        requestId,
      },
      { status: 400 },
    );
  }

  const stack = error instanceof Error ? error.stack : undefined;
  const minimalStack =
    stack?.split("\n").slice(0, 3).map((line) => line.trim()) ?? undefined;

  return NextResponse.json(
    {
      error: "internal_error",
      requestId,
      ...(isProd
        ? {}
        : {
            message: error instanceof Error ? error.message : "Unknown error",
            stack: minimalStack,
          }),
    },
    { status: 500 },
  );
};
