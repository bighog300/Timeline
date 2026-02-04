-- CreateEnum
CREATE TYPE "DriveContentStatus" AS ENUM ('PENDING', 'INGESTED', 'ERROR', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('RAW_TEXT', 'CHUNKS_JSON', 'METADATA_JSON');

-- AlterTable
ALTER TABLE "DriveFileRef" ADD COLUMN     "ingestedAt" TIMESTAMP(3),
ADD COLUMN     "contentVersion" TEXT,
ADD COLUMN     "contentStatus" "DriveContentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "contentLastError" TEXT;

-- CreateTable
CREATE TABLE "DerivedArtifact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "driveFileRefId" TEXT NOT NULL,
    "type" "ArtifactType" NOT NULL,
    "contentText" TEXT,
    "contentJson" JSONB,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DerivedArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DerivedArtifact_driveFileRefId_type_contentHash_key" ON "DerivedArtifact"("driveFileRefId", "type", "contentHash");

-- CreateIndex
CREATE INDEX "DerivedArtifact_userId_idx" ON "DerivedArtifact"("userId");

-- AddForeignKey
ALTER TABLE "DerivedArtifact" ADD CONSTRAINT "DerivedArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DerivedArtifact" ADD CONSTRAINT "DerivedArtifact_driveFileRefId_fkey" FOREIGN KEY ("driveFileRefId") REFERENCES "DriveFileRef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
