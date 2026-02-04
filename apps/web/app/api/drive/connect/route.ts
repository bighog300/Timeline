import { NextResponse } from "next/server";

import { getCurrentUser } from "../../../../src/server/auth/session";
import { getDriveConnection } from "../../../../src/server/google/oauth";

export const POST = async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const connection = await getDriveConnection(user.id);
  if (!connection) {
    return NextResponse.json(
      { error: "Drive connection not found. Re-authenticate first." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
};
