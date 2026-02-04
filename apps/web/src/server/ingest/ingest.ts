import { createHash } from "crypto";

import { ArtifactType, DriveContentStatus, DriveFileStatus } from "@prisma/client";

import { getEnv } from "../../env";
import { prisma } from "../db/prisma";
import { fetchDriveFileText } from "../google/drive";
import { chunkText } from "./chunking";

const hashString = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const getContentVersion = (file: {
  modifiedTime: Date | null;
  checksum: string | null;
}) => file.modifiedTime?.toISOString() ?? file.checksum ?? null;

const buildSourceMetadata = (file: {
  driveFileId: string;
  name: string;
  mimeType: string;
  modifiedTime: Date | null;
}) => ({
  driveFileId: file.driveFileId,
  name: file.name,
  mimeType: file.mimeType,
  modifiedTime: file.modifiedTime?.toISOString() ?? null,
});

export const ingestDriveFiles = async (userId: string) => {
  const env = getEnv();
  const maxFiles = env.INGEST_MAX_FILES_PER_RUN;
  const maxBytes = env.INGEST_MAX_BYTES_PER_RUN;

  const candidates = await prisma.driveFileRef.findMany({
    where: {
      userId,
      status: {
        in: [DriveFileStatus.NEW, DriveFileStatus.INDEXED],
      },
      contentStatus: DriveContentStatus.PENDING,
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: maxFiles,
  });

  let bytesProcessed = 0;
  let processed = 0;
  let ingested = 0;
  let skipped = 0;
  let errored = 0;

  for (const file of candidates) {
    if (processed >= maxFiles) {
      break;
    }

    const sizeBytes = file.sizeBytes ? Number(file.sizeBytes) : null;
    if (sizeBytes && bytesProcessed + sizeBytes > maxBytes) {
      // Enforce per-run byte limit before downloading.
      break;
    }

    processed += 1;

    try {
      const textResult = await fetchDriveFileText({
        userId,
        driveFileId: file.driveFileId,
        mimeType: file.mimeType,
      });

      if (textResult.status === "skipped") {
        skipped += 1;
        await prisma.driveFileRef.update({
          where: { id: file.id },
          data: {
            contentStatus: DriveContentStatus.SKIPPED,
            contentLastError: textResult.reason,
            contentVersion: getContentVersion(file),
          },
        });
        continue;
      }

      bytesProcessed += textResult.bytes;

      const rawText = textResult.text;
      const rawHash = hashString(rawText);
      const source = buildSourceMetadata(file);

      const chunks = chunkText({
        text: rawText,
        maxChars: env.CHUNK_MAX_CHARS,
        overlapChars: env.CHUNK_OVERLAP_CHARS,
      });
      const chunksPayload = {
        chunks,
        source,
      };
      const chunksHash = hashString(JSON.stringify(chunksPayload));

      const metadataPayload = {
        source,
        sizeBytes: file.sizeBytes ? Number(file.sizeBytes) : null,
        checksum: file.checksum ?? null,
        contentVersion: getContentVersion(file),
      };
      const metadataHash = hashString(JSON.stringify(metadataPayload));

      // Upsert by content hash to keep ingestion idempotent across runs.
      await prisma.$transaction([
        prisma.derivedArtifact.upsert({
          where: {
            driveFileRefId_type_contentHash: {
              driveFileRefId: file.id,
              type: ArtifactType.RAW_TEXT,
              contentHash: rawHash,
            },
          },
          update: {
            contentText: rawText,
            updatedAt: new Date(),
          },
          create: {
            userId,
            driveFileRefId: file.id,
            type: ArtifactType.RAW_TEXT,
            contentText: rawText,
            contentHash: rawHash,
          },
        }),
        prisma.derivedArtifact.upsert({
          where: {
            driveFileRefId_type_contentHash: {
              driveFileRefId: file.id,
              type: ArtifactType.CHUNKS_JSON,
              contentHash: chunksHash,
            },
          },
          update: {
            contentJson: chunksPayload,
            updatedAt: new Date(),
          },
          create: {
            userId,
            driveFileRefId: file.id,
            type: ArtifactType.CHUNKS_JSON,
            contentJson: chunksPayload,
            contentHash: chunksHash,
          },
        }),
        prisma.derivedArtifact.upsert({
          where: {
            driveFileRefId_type_contentHash: {
              driveFileRefId: file.id,
              type: ArtifactType.METADATA_JSON,
              contentHash: metadataHash,
            },
          },
          update: {
            contentJson: metadataPayload,
            updatedAt: new Date(),
          },
          create: {
            userId,
            driveFileRefId: file.id,
            type: ArtifactType.METADATA_JSON,
            contentJson: metadataPayload,
            contentHash: metadataHash,
          },
        }),
        prisma.driveFileRef.update({
          where: { id: file.id },
          data: {
            contentStatus: DriveContentStatus.INGESTED,
            contentLastError: null,
            contentVersion: getContentVersion(file),
            ingestedAt: new Date(),
          },
        }),
      ]);

      ingested += 1;
    } catch (error) {
      errored += 1;
      await prisma.driveFileRef.update({
        where: { id: file.id },
        data: {
          contentStatus: DriveContentStatus.ERROR,
          contentLastError:
            error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  const remaining = await prisma.driveFileRef.count({
    where: {
      userId,
      status: {
        in: [DriveFileStatus.NEW, DriveFileStatus.INDEXED],
      },
      contentStatus: DriveContentStatus.PENDING,
    },
  });

  return {
    processed,
    ingested,
    skipped,
    errored,
    bytes: bytesProcessed,
    done: remaining === 0,
  };
};
