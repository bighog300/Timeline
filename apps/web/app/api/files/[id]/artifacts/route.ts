import { NextResponse } from "next/server";

import { getCurrentUser } from "../../../../../src/server/auth/session";
import { prisma } from "../../../../../src/server/db/prisma";

export const GET = async (
  request: Request,
  { params }: { params: { id: string } },
) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const driveFileRef = await prisma.driveFileRef.findFirst({
    where: {
      id: params.id,
      userId: user.id,
    },
  });

  if (!driveFileRef) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const includeText = url.searchParams.get("includeText") === "1";

  const artifacts = await prisma.derivedArtifact.findMany({
    where: {
      driveFileRefId: driveFileRef.id,
      userId: user.id,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      type: true,
      updatedAt: true,
      contentHash: true,
      contentText: includeText,
      contentJson: includeText,
    },
  });

  return NextResponse.json({
    fileId: driveFileRef.id,
    artifacts,
  });
};
