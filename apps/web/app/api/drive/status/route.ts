import { NextResponse } from "next/server";

import { requireCurrentUser } from "../../../../src/server/auth/session";
import { prisma } from "../../../../src/server/db/prisma";
import { getDriveConnection } from "../../../../src/server/google/oauth";
import { withApiHandler } from "../../../../src/server/http";

export const GET = withApiHandler("/api/drive/status", async ({ setUserId }) => {
  const user = await requireCurrentUser();
  setUserId(user.id);

  const connection = await getDriveConnection(user.id);
  const counts = await prisma.driveFileRef.groupBy({
    by: ["status"],
    where: {
      userId: user.id,
    },
    _count: {
      _all: true,
    },
  });

  const statusCounts = {
    NEW: 0,
    INDEXED: 0,
    SKIPPED: 0,
    ERROR: 0,
  };

  for (const entry of counts) {
    statusCounts[entry.status] = entry._count._all;
  }

  return NextResponse.json({
    connected: Boolean(connection),
    statusCounts,
  });
});
