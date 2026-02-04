import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { getCurrentUser } from "../../../../../../src/server/auth/session";
import { prisma } from "../../../../../../src/server/db/prisma";
import { searchEmbeddings } from "../../../../../../src/server/embeddings/pipeline";
import { generateAnswer, type Citation } from "../../../../../../src/server/llm/chat";

const MAX_MESSAGE_CHARS = 6000;
const DEFAULT_RETRIEVAL_LIMIT = 8;
const MAX_RETRIEVAL_LIMIT = 12;

const truncateTitle = (content: string) => {
  const trimmed = content.trim();
  const maxChars = 80;
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars - 1)}…` : trimmed;
};

export const POST = async (
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
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  let body: { content?: string; limit?: number };
  try {
    body = (await request.json()) as { content?: string; limit?: number };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const content = body.content?.trim() ?? "";
  if (!content) {
    return NextResponse.json({ error: "Message content is required." }, { status: 400 });
  }
  if (content.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `Message is too long (max ${MAX_MESSAGE_CHARS} characters).` },
      { status: 400 },
    );
  }

  const userMessage = await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: "USER",
      content,
    },
  });

  if (!thread.title) {
    const userMessageCount = await prisma.chatMessage.count({
      where: {
        threadId: thread.id,
        role: "USER",
      },
    });

    if (userMessageCount === 1) {
      await prisma.chatThread.update({
        where: { id: thread.id },
        data: { title: truncateTitle(content) },
      });
    }
  }

  const embeddingCount = await prisma.chunkEmbedding.count({
    where: {
      userId: user.id,
    },
  });

  if (embeddingCount === 0) {
    const fallback =
      "I don't have any indexed Drive content yet. Run ingestion and embeddings, then try again.";
    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "ASSISTANT",
        content: fallback,
      },
    });

    return NextResponse.json({ answer: fallback, citations: [] });
  }

  const retrievalLimit = Math.min(
    MAX_RETRIEVAL_LIMIT,
    Math.max(1, body.limit ?? DEFAULT_RETRIEVAL_LIMIT),
  );

  const matches = await searchEmbeddings(user.id, content, retrievalLimit);

  if (matches.length === 0) {
    const fallback =
      "I couldn't find relevant context in your indexed Drive content. Try rephrasing or ingesting more files.";
    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "ASSISTANT",
        content: fallback,
      },
    });

    return NextResponse.json({ answer: fallback, citations: [] });
  }

  const recentMessages = await prisma.chatMessage.findMany({
    where: {
      threadId: thread.id,
      id: {
        not: userMessage.id,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 12,
  });

  const conversation = recentMessages
    .slice()
    .reverse()
    .map((message) => ({
      role: message.role,
      content: message.content,
    }))
    .filter((message) => message.role !== "SYSTEM")
    .map((message) => ({
      role: message.role === "USER" ? "USER" : "ASSISTANT",
      content: message.content,
    }));

  const { answer, citations } = await generateAnswer({
    query: content,
    contextChunks: matches.map((match) => ({
      driveFileRefId: match.driveFileRefId,
      driveFileName: match.driveFileName,
      chunkIndex: match.chunkIndex,
      score: match.score,
      snippet: match.snippet,
    })),
    conversation,
  });

  await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: "ASSISTANT",
      content: answer,
      citationsJson: citations as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ answer, citations });
};
