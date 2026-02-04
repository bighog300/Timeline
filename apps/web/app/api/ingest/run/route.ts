import { NextResponse } from "next/server";

import { getCurrentUser } from "../../../../src/server/auth/session";
import { ingestDriveFiles } from "../../../../src/server/ingest/ingest";

export const POST = async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const summary = await ingestDriveFiles(user.id);
  return NextResponse.json(summary);
};
