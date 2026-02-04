type LogOutcome = "success" | "error";

type LogEvent = {
  level?: "info" | "error";
  requestId: string;
  userId?: string;
  route?: string;
  durationMs?: number;
  outcome?: LogOutcome;
  errorCode?: string;
  event?: string;
  metadata?: Record<string, unknown>;
};

const writeLog = (payload: LogEvent) => {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...payload,
  });

  if (payload.level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
};

export const getRequestId = (request: Request) =>
  request.headers.get("x-request-id") ?? crypto.randomUUID();

export const logRequest = (payload: {
  requestId: string;
  userId?: string;
  route: string;
  durationMs: number;
  outcome: LogOutcome;
  errorCode?: string;
}) =>
  writeLog({
    level: payload.outcome === "error" ? "error" : "info",
    requestId: payload.requestId,
    userId: payload.userId,
    route: payload.route,
    durationMs: payload.durationMs,
    outcome: payload.outcome,
    errorCode: payload.errorCode,
  });

export const logTiming = (payload: {
  requestId?: string;
  userId?: string;
  route?: string;
  operation: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}) =>
  writeLog({
    level: "info",
    requestId: payload.requestId ?? "unknown",
    userId: payload.userId,
    route: payload.route,
    durationMs: payload.durationMs,
    event: payload.operation,
    metadata: payload.metadata,
  });
