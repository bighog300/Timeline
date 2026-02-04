import {
  ArtifactType,
  Prisma,
  type DerivedArtifact,
  type PrismaClient,
} from "@prisma/client";

import { getEnv } from "../../env";
import { prisma } from "../db/prisma";
import { embedTexts } from "../llm/openai";

const vectorSql = (embedding: number[]) =>
  Prisma.sql`ARRAY[${Prisma.join(embedding)}]::vector`;

const parseChunks = (artifact: DerivedArtifact) => {
  if (!artifact.contentJson) {
    return [];
  }

  const payload = artifact.contentJson as {
    chunks?: Array<{ index: number; text: string }>;
  };

  if (!Array.isArray(payload.chunks)) {
    return [];
  }

  return payload.chunks
    .filter((chunk) => typeof chunk.text === "string")
    .map((chunk) => ({
      index: chunk.index,
      text: chunk.text,
    }));
};

const insertEmbeddings = async (
  client: PrismaClient,
  rows: Array<{
    id: string;
    userId: string;
    driveFileRefId: string;
    artifactId: string;
    chunkIndex: number;
    chunkText: string;
    contentHash: string;
    embedding: number[];
  }>,
) => {
  if (rows.length === 0) {
    return;
  }

  const values = rows.map((row) =>
    Prisma.sql`(
      ${row.id},
      ${row.userId},
      ${row.driveFileRefId},
      ${row.artifactId},
      ${row.chunkIndex},
      ${row.chunkText},
      ${row.contentHash},
      ${vectorSql(row.embedding)},
      ${new Date()},
      ${new Date()}
    )`,
  );

  await client.$executeRaw(
    Prisma.sql`
      INSERT INTO "ChunkEmbedding" (
        "id",
        "userId",
        "driveFileRefId",
        "artifactId",
        "chunkIndex",
        "chunkText",
        "contentHash",
        "embedding",
        "createdAt",
        "updatedAt"
      ) VALUES ${Prisma.join(values)}
      ON CONFLICT ("artifactId", "chunkIndex", "contentHash") DO NOTHING
    `,
  );
};

const fetchExistingChunkIndexes = async (
  client: PrismaClient,
  artifactId: string,
  contentHash: string,
) => {
  const existing = await client.chunkEmbedding.findMany({
    where: {
      artifactId,
      contentHash,
    },
    select: {
      chunkIndex: true,
    },
  });

  return new Set(existing.map((row) => row.chunkIndex));
};

export const runEmbeddingPipeline = async (
  userId: string,
  options?: { driveFileRefId?: string; maxChunks?: number; requestId?: string },
) => {
  const env = getEnv();
  const maxChunks = options?.maxChunks ?? env.EMBED_MAX_CHUNKS_PER_RUN;
  const pageSize = 10;

  let processedArtifacts = 0;
  let embeddedChunks = 0;
  let skippedChunks = 0;
  let offset = 0;
  let reachedEnd = false;

  while (embeddedChunks < maxChunks && !reachedEnd) {
    const artifacts = await prisma.derivedArtifact.findMany({
      where: {
        userId,
        type: ArtifactType.CHUNKS_JSON,
        ...(options?.driveFileRefId ? { driveFileRefId: options.driveFileRefId } : {}),
      },
      orderBy: [
        { driveFileRef: { ingestedAt: "desc" } },
        { updatedAt: "desc" },
      ],
      take: pageSize,
      skip: offset,
      include: {
        driveFileRef: {
          select: {
            id: true,
          },
        },
      },
    });

    if (artifacts.length === 0) {
      reachedEnd = true;
      break;
    }

    for (const artifact of artifacts) {
      if (embeddedChunks >= maxChunks) {
        break;
      }

      processedArtifacts += 1;
      const chunks = parseChunks(artifact);
      if (chunks.length === 0) {
        continue;
      }

      const existing = await fetchExistingChunkIndexes(
        prisma,
        artifact.id,
        artifact.contentHash,
      );
      skippedChunks += existing.size;

      const remainingCapacity = maxChunks - embeddedChunks;
      const missing = chunks.filter((chunk) => !existing.has(chunk.index));
      const selected = missing.slice(0, remainingCapacity);

      if (selected.length === 0) {
        continue;
      }

      const embeddings = await embedTexts(selected.map((chunk) => chunk.text), {
        requestId: options?.requestId,
        userId,
        route: "/api/embed/run",
      });
      if (embeddings.length !== selected.length) {
        throw new Error(\"Embedding response size mismatch.\");
      }
      const rows = selected.map((chunk, index) => ({
        id: crypto.randomUUID(),
        userId,
        driveFileRefId: artifact.driveFileRefId,
        artifactId: artifact.id,
        chunkIndex: chunk.index,
        chunkText: chunk.text,
        contentHash: artifact.contentHash,
        embedding: embeddings[index],
      }));

      await insertEmbeddings(prisma, rows);
      embeddedChunks += rows.length;

      if (embeddedChunks >= maxChunks) {
        break;
      }
    }

    offset += pageSize;
  }

  return {
    processedArtifacts,
    embeddedChunks,
    skippedChunks,
    done: embeddedChunks < maxChunks && reachedEnd,
  };
};

export const searchEmbeddings = async (
  userId: string,
  query: string,
  limit: number,
  requestId?: string,
) => {
  const [queryEmbedding] = await embedTexts([query], {
    requestId,
    userId,
    route: "/api/search",
  });
  const queryVector = vectorSql(queryEmbedding);

  const rows = await prisma.$queryRaw<
    Array<{
      score: number;
      driveFileRefId: string;
      driveFileName: string;
      chunkIndex: number;
      snippet: string;
      updatedAt: Date;
    }>
  >(
    Prisma.sql`
      SELECT
        ce."driveFileRefId",
        df."name" AS "driveFileName",
        ce."chunkIndex",
        ce."chunkText" AS "snippet",
        ce."updatedAt",
        1 - (ce."embedding" <=> ${queryVector}) AS "score"
      FROM "ChunkEmbedding" ce
      JOIN "DriveFileRef" df ON df."id" = ce."driveFileRefId"
      WHERE ce."userId" = ${userId}
      -- pgvector <=> is cosine distance; lower is more similar.
      ORDER BY ce."embedding" <=> ${queryVector}
      LIMIT ${limit}
    `,
  );

  return rows;
};
