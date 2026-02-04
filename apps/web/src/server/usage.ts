import { prisma } from "./db/prisma";
import { getEnv } from "../env";
import { QuotaError } from "./errors";

const getPeriodStartUtc = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const resetCounts = {
  searchCount: 0,
  embedChunkCount: 0,
  chatMessageCount: 0,
  llmTokenEstimate: 0,
};

export const ensureUsageCounter = async (userId: string) => {
  const periodStart = getPeriodStartUtc(new Date());
  const existing = await prisma.usageCounter.findUnique({
    where: { userId },
  });

  if (!existing) {
    return prisma.usageCounter.create({
      data: {
        userId,
        periodStart,
        ...resetCounts,
      },
    });
  }

  if (existing.periodStart < periodStart) {
    return prisma.usageCounter.update({
      where: { userId },
      data: {
        periodStart,
        ...resetCounts,
      },
    });
  }

  return existing;
};

export const getQuotaLimits = () => {
  const env = getEnv();
  return {
    searches: env.MAX_SEARCHES_PER_DAY,
    embedChunks: env.MAX_EMBED_CHUNKS_PER_DAY,
    chatMessages: env.MAX_CHAT_MESSAGES_PER_DAY,
    llmTokens: env.MAX_LLM_TOKENS_PER_DAY,
  };
};

export const getQuotaSnapshot = async (userId: string) => {
  const counter = await ensureUsageCounter(userId);
  const limits = getQuotaLimits();

  return {
    periodStart: counter.periodStart,
    usage: {
      searchCount: counter.searchCount,
      embedChunkCount: counter.embedChunkCount,
      chatMessageCount: counter.chatMessageCount,
      llmTokenEstimate: counter.llmTokenEstimate,
    },
    limits,
    remaining: {
      searches: Math.max(0, limits.searches - counter.searchCount),
      embedChunks: Math.max(0, limits.embedChunks - counter.embedChunkCount),
      chatMessages: Math.max(0, limits.chatMessages - counter.chatMessageCount),
      llmTokens: Math.max(0, limits.llmTokens - counter.llmTokenEstimate),
    },
  };
};

const assertRemaining = (limit: number, remaining: number) => {
  if (remaining <= 0) {
    throw new QuotaError(limit, 0);
  }
};

export const assertWithinAllQuotas = async (userId: string) => {
  const counter = await ensureUsageCounter(userId);
  const limits = getQuotaLimits();

  assertRemaining(limits.searches, limits.searches - counter.searchCount);
  assertRemaining(limits.embedChunks, limits.embedChunks - counter.embedChunkCount);
  assertRemaining(limits.chatMessages, limits.chatMessages - counter.chatMessageCount);
  assertRemaining(limits.llmTokens, limits.llmTokens - counter.llmTokenEstimate);
};

export const assertSearchQuota = async (userId: string, increment = 1) => {
  const counter = await ensureUsageCounter(userId);
  const limit = getQuotaLimits().searches;
  const remaining = limit - counter.searchCount;
  if (remaining < increment) {
    throw new QuotaError(limit, Math.max(0, remaining));
  }
};

export const recordSearchUsage = async (userId: string, increment = 1) => {
  await ensureUsageCounter(userId);
  return prisma.usageCounter.update({
    where: { userId },
    data: {
      searchCount: { increment },
    },
  });
};

export const assertEmbedQuota = async (userId: string, requested: number) => {
  const counter = await ensureUsageCounter(userId);
  const limit = getQuotaLimits().embedChunks;
  const remaining = limit - counter.embedChunkCount;
  if (remaining < requested) {
    throw new QuotaError(limit, Math.max(0, remaining));
  }
  return remaining;
};

export const recordEmbedUsage = async (userId: string, increment: number) => {
  if (increment <= 0) {
    return;
  }
  await ensureUsageCounter(userId);
  await prisma.usageCounter.update({
    where: { userId },
    data: {
      embedChunkCount: { increment },
    },
  });
};

export const assertChatQuota = async (
  userId: string,
  messageCount: number,
  llmTokenEstimate: number,
) => {
  const counter = await ensureUsageCounter(userId);
  const limits = getQuotaLimits();
  const remainingMessages = limits.chatMessages - counter.chatMessageCount;
  const remainingTokens = limits.llmTokens - counter.llmTokenEstimate;

  if (remainingMessages < messageCount) {
    throw new QuotaError(limits.chatMessages, Math.max(0, remainingMessages));
  }
  if (remainingTokens < llmTokenEstimate) {
    throw new QuotaError(limits.llmTokens, Math.max(0, remainingTokens));
  }
};

export const recordChatUsage = async (
  userId: string,
  messageCount: number,
  llmTokenEstimate: number,
) => {
  await ensureUsageCounter(userId);
  await prisma.usageCounter.update({
    where: { userId },
    data: {
      chatMessageCount: { increment: messageCount },
      llmTokenEstimate: { increment: llmTokenEstimate },
    },
  });
};
