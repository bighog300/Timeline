-- CreateEnum
CREATE TYPE "DriveFileStatus" AS ENUM ('NEW', 'INDEXED', 'SKIPPED', 'ERROR');

-- CreateTable
CREATE TABLE "DriveConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "scopes" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveFileRef" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "modifiedTime" TIMESTAMP(3),
    "sizeBytes" BIGINT,
    "checksum" TEXT,
    "status" "DriveFileStatus" NOT NULL DEFAULT 'NEW',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveFileRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cursor" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastFileId" TEXT,
    "statsJson" JSONB,

    CONSTRAINT "IndexState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriveConnection_userId_provider_key" ON "DriveConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "DriveConnection_userId_idx" ON "DriveConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DriveFileRef_userId_driveFileId_key" ON "DriveFileRef"("userId", "driveFileId");

-- CreateIndex
CREATE INDEX "DriveFileRef_userId_idx" ON "DriveFileRef"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IndexState_userId_key" ON "IndexState"("userId");

-- AddForeignKey
ALTER TABLE "DriveConnection" ADD CONSTRAINT "DriveConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveFileRef" ADD CONSTRAINT "DriveFileRef_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndexState" ADD CONSTRAINT "IndexState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
