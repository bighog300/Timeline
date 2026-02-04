import { NextResponse } from "next/server";

import { requireCurrentUser } from "../../../../src/server/auth/session";
import { prisma } from "../../../../src/server/db/prisma";
import { ensureChatEnabled } from "../../../../src/server/featureFlags";
import { withApiHandler } from "../../../../src/server/http";
import { assertCsrfToken } from "../../../../src/server/security/csrf";
import { assertWithinAllQuotas } from "../../../../src/server/usage";

export const POST = withApiHandler("/api/chat/thread", async ({ request, setUserId }) => {
  await assertCsrfToken(request);
  ensureChatEnabled();

  const user = await requireCurrentUser();
  setUserId(user.id);
  await assertWithinAllQuotas(user.id);

  const thread = await prisma.chatThread.create({
    data: {
      userId: user.id,
    },
    select: {
      id: true,
    },
  });

  return NextResponse.json({ threadId: thread.id });
});
