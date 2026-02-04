import { NextResponse } from "next/server";

import { getCurrentUser } from "../../../src/server/auth/session";
import { searchEmbeddings } from "../../../src/server/embeddings/pipeline";

type SearchRequest = {
  query?: string;
  limit?: number;
};

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

export const POST = async (request: Request) => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: SearchRequest;
  try {
    body = (await request.json()) as SearchRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "Query is required." }, { status: 400 });
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, body.limit ?? DEFAULT_LIMIT),
  );

  const results = await searchEmbeddings(user.id, query, limit);

  return NextResponse.json({
    results: results.map((row) => ({
      score: row.score,
      driveFileRefId: row.driveFileRefId,
      driveFileName: row.driveFileName,
      chunkIndex: row.chunkIndex,
      snippet: row.snippet,
      updatedAt: row.updatedAt,
    })),
  });
};
