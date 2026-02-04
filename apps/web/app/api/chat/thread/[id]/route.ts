import { NextResponse } from "next/server";

import { getCurrentUser } from "../../../../../src/server/auth/session";
import { prisma } from "../../../../../src/server/db/prisma";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export const GET = async (
  request: Request,
  { params }: { params: { id: string } },
) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const thread = await prisma.chatThread.findFirst({
    where: {
      id: params.id,
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
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
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
};
