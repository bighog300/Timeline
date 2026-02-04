import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "../../../../../src/server/auth/session";
import { prisma } from "../../../../../src/server/db/prisma";
import { ensureChatEnabled } from "../../../../../src/server/featureFlags";
import { NotFoundError } from "../../../../../src/server/errors";
import { withApiHandler } from "../../../../../src/server/http";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export const GET = withApiHandler(
  "/api/chat/thread/[id]",
  async ({ request, params, setUserId }) => {
    ensureChatEnabled();
    const user = await requireCurrentUser();
    setUserId(user.id);

    const threadId = z.string().uuid().parse(params.id);
    const thread = await prisma.chatThread.findFirst({
      where: {
        id: threadId,
        userId: user.id,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!thread) {
      throw new NotFoundError("Thread not found.");
    }

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const beforeParam = searchParams.get("before");
    const parsedLimit = limitParam ? Number(limitParam) : DEFAULT_LIMIT;
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_LIMIT),
    );
    const before = beforeParam ? new Date(beforeParam) : null;

    const messages = await prisma.chatMessage.findMany({
      where: {
        threadId: thread.id,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });

    return NextResponse.json({
      thread,
      messages: messages
        .slice()
        .reverse()
        .map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          citations: message.citationsJson,
          createdAt: message.createdAt,
        })),
    });
  },
);
