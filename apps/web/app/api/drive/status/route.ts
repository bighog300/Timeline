import { NextResponse } from "next/server";

import { getCurrentUser } from "../../../../src/server/auth/session";
import { prisma } from "../../../../src/server/db/prisma";
import { getDriveConnection } from "../../../../src/server/google/oauth";

export const GET = async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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
};
