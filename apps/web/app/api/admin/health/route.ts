import { NextResponse } from "next/server";

import { getEnv } from "../../../../../src/env";
import { requireCurrentUser } from "../../../../../src/server/auth/session";
import { prisma } from "../../../../../src/server/db/prisma";
import { ForbiddenError } from "../../../../../src/server/errors";
import { withApiHandler } from "../../../../../src/server/http";
import { getQuotaSnapshot } from "../../../../../src/server/usage";

const getAdminEmails = () => {
  const env = getEnv();
  return env.ADMIN_EMAILS.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
};

export const GET = withApiHandler("/api/admin/health", async ({ setUserId }) => {
  const user = await requireCurrentUser();
  setUserId(user.id);

  const adminEmails = getAdminEmails();
  if (!adminEmails.includes(user.email.toLowerCase())) {
    throw new ForbiddenError("Admin access required.");
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    userCount,
    fileCount,
    chunkCount,
    embeddingCount,
    driveIndexErrors,
    driveContentErrors,
    quotaSnapshot,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.driveFileRef.count(),
    prisma.derivedArtifact.count({ where: { type: "CHUNKS_JSON" } }),
    prisma.chunkEmbedding.count(),
    prisma.driveFileRef.count({
      where: {
        status: "ERROR",
        updatedAt: { gte: since },
      },
    }),
    prisma.driveFileRef.count({
      where: {
        contentStatus: "ERROR",
        updatedAt: { gte: since },
      },
    }),
    getQuotaSnapshot(user.id),
  ]);

  return NextResponse.json({
    ok: true,
    counts: {
      users: userCount,
      files: fileCount,
      chunks: chunkCount,
      embeddings: embeddingCount,
    },
    recentErrors: {
      driveIndexErrors,
      driveContentErrors,
      windowHours: 24,
    },
    quota: quotaSnapshot,
  });
});
