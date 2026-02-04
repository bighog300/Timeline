CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "ChunkEmbedding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "driveFileRefId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "chunkText" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChunkEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChunkEmbedding_artifactId_chunkIndex_contentHash_key" ON "ChunkEmbedding"("artifactId", "chunkIndex", "contentHash");
CREATE INDEX "ChunkEmbedding_userId_idx" ON "ChunkEmbedding"("userId");
CREATE INDEX "ChunkEmbedding_driveFileRefId_idx" ON "ChunkEmbedding"("driveFileRefId");

ALTER TABLE "ChunkEmbedding" ADD CONSTRAINT "ChunkEmbedding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChunkEmbedding" ADD CONSTRAINT "ChunkEmbedding_driveFileRefId_fkey" FOREIGN KEY ("driveFileRefId") REFERENCES "DriveFileRef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChunkEmbedding" ADD CONSTRAINT "ChunkEmbedding_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "DerivedArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
