import { getErrorCode, toErrorResponse } from "./errors";
import { getRequestId, logRequest } from "./logging";

type HandlerContext = {
  request: Request;
  params: Record<string, string>;
  requestId: string;
  route: string;
  setUserId: (userId?: string) => void;
};

export const withApiHandler =
  (
    route: string,
    handler: (context: HandlerContext) => Promise<Response>,
  ) =>
  async (request: Request, context?: { params?: Record<string, string> }) => {
    const requestId = getRequestId(request);
    const startTime = Date.now();
    let userId: string | undefined;

    try {
      const response = await handler({
        request,
        params: context?.params ?? {},
        requestId,
        route,
        setUserId: (id?: string) => {
          userId = id ?? undefined;
        },
      });

      logRequest({
        requestId,
        userId,
        route,
        durationMs: Date.now() - startTime,
        outcome: "success",
      });

      return response;
    } catch (error) {
      const errorCode = getErrorCode(error);
      logRequest({
        requestId,
        userId,
        route,
        durationMs: Date.now() - startTime,
        outcome: "error",
        errorCode,
      });

      return toErrorResponse(error, requestId);
    }
  };
