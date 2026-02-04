import { NextResponse } from "next/server";

import { requireCurrentUser } from "../../../src/server/auth/session";
import { prisma } from "../../../src/server/db/prisma";
import { withApiHandler } from "../../../src/server/http";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export const GET = withApiHandler("/api/files", async ({ request, setUserId }) => {
  const user = await requireCurrentUser();
  setUserId(user.id);

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const [files, total, statusCounts, contentStatusCounts] =
    await Promise.all([
      prisma.driveFileRef.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.driveFileRef.count({ where: { userId: user.id } }),
      prisma.driveFileRef.groupBy({
        by: ["status"],
        where: { userId: user.id },
        _count: { status: true },
      }),
      prisma.driveFileRef.groupBy({
        by: ["contentStatus"],
        where: { userId: user.id },
        _count: { contentStatus: true },
      }),
    ]);

  return NextResponse.json({
    files: files.map((file) => ({
      ...file,
      sizeBytes: file.sizeBytes ? Number(file.sizeBytes) : null,
    })),
    limit,
    offset,
    total,
    statusCounts: Object.fromEntries(
      statusCounts.map((row) => [row.status, row._count.status]),
    ),
    contentStatusCounts: Object.fromEntries(
      contentStatusCounts.map((row) => [row.contentStatus, row._count.contentStatus]),
    ),
  });
});
