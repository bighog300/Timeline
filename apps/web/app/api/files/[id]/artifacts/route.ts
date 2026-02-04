import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "../../../../../src/server/auth/session";
import { prisma } from "../../../../../src/server/db/prisma";
import { NotFoundError } from "../../../../../src/server/errors";
import { withApiHandler } from "../../../../../src/server/http";

export const GET = withApiHandler(
  "/api/files/[id]/artifacts",
  async ({ request, params, setUserId }) => {
    const user = await requireCurrentUser();
    setUserId(user.id);

    const fileId = z.string().uuid().parse(params.id);
    const driveFileRef = await prisma.driveFileRef.findFirst({
      where: {
        id: fileId,
        userId: user.id,
      },
    });

    if (!driveFileRef) {
      throw new NotFoundError("Not found.");
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
  },
);
