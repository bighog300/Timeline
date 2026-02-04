import { NextResponse } from "next/server";

import { getCurrentUser } from "../../../../src/server/auth/session";
import { prisma } from "../../../../src/server/db/prisma";

export const POST = async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const thread = await prisma.chatThread.create({
    data: {
      userId: user.id,
    },
    select: {
      id: true,
    },
  });

  return NextResponse.json({ threadId: thread.id });
};
