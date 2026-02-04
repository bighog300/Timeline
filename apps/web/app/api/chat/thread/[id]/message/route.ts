import { NextResponse } from "next/server";
import { z } from "zod";

import { Prisma } from "@prisma/client";

import { requireCurrentUser } from "../../../../../../src/server/auth/session";
import { prisma } from "../../../../../../src/server/db/prisma";
import { searchEmbeddings } from "../../../../../../src/server/embeddings/pipeline";
import { ensureChatEnabled, ensureEmbeddingsEnabled } from "../../../../../../src/server/featureFlags";
import { NotFoundError, ValidationError } from "../../../../../../src/server/errors";
import { withApiHandler } from "../../../../../../src/server/http";
import { generateAnswer } from "../../../../../../src/server/llm/chat";
import { assertCsrfToken } from "../../../../../../src/server/security/csrf";
import { assertChatQuota, recordChatUsage } from "../../../../../../src/server/usage";

const MAX_MESSAGE_CHARS = 6000;
const DEFAULT_RETRIEVAL_LIMIT = 8;
const MAX_RETRIEVAL_LIMIT = 12;

const messageSchema = z.object({
  content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  limit: z.coerce.number().int().min(1).max(MAX_RETRIEVAL_LIMIT).optional(),
});

const estimateTokens = (text: string) =>
  Math.max(1, Math.ceil(text.length / 4));

const truncateTitle = (content: string) => {
  const trimmed = content.trim();
  const maxChars = 80;
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars - 1)}…` : trimmed;
};

export const POST = withApiHandler(
  "/api/chat/thread/[id]/message",
  async ({ request, params, requestId, setUserId }) => {
    await assertCsrfToken(request);
    ensureChatEnabled();
    ensureEmbeddingsEnabled();

    const user = await requireCurrentUser();
    setUserId(user.id);

    const threadId = z.string().uuid().parse(params.id);
    const thread = await prisma.chatThread.findFirst({
      where: {
        id: threadId,
        userId: user.id,
      },
    });

    if (!thread) {
      throw new NotFoundError("Thread not found.");
    }

    const body = messageSchema.parse(
      await request.json().catch(() => {
        throw new ValidationError("Invalid request body.");
      }),
    );
    const content = body.content.trim();
    if (content.length > MAX_MESSAGE_CHARS) {
      throw new ValidationError(
        `Message is too long (max ${MAX_MESSAGE_CHARS} characters).`,
      );
    }

    // Rough token estimate: 1 token ~= 4 chars. Add a fixed buffer for context + output.
    const tokenEstimate = estimateTokens(content) + 800;
    await assertChatQuota(user.id, 1, tokenEstimate);

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

    const matches = await searchEmbeddings(
      user.id,
      content,
      retrievalLimit,
      requestId,
    );

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
      requestContext: {
        requestId,
        userId: user.id,
        route: "/api/chat/thread/[id]/message",
      },
    });

    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "ASSISTANT",
        content: answer,
        citationsJson: citations as Prisma.InputJsonValue,
      },
    });

    await recordChatUsage(user.id, 1, tokenEstimate);

    return NextResponse.json({ answer, citations });
  },
);
