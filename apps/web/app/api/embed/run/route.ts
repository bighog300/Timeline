import { NextResponse } from "next/server";

import { getCurrentUser } from "../../../../src/server/auth/session";
import { runEmbeddingPipeline } from "../../../../src/server/embeddings/pipeline";

type EmbedRunRequest = {
  driveFileRefId?: string;
};

export const POST = async (request: Request) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: EmbedRunRequest | null = null;
  try {
    payload = (await request.json()) as EmbedRunRequest;
  } catch {
    payload = null;
  }

  const summary = await runEmbeddingPipeline(user.id, {
    driveFileRefId: payload?.driveFileRefId,
  });

  return NextResponse.json(summary);
};
