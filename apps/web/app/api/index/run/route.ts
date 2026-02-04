import { NextResponse } from "next/server";

import { getEnv } from "../../../../src/env";
import { getCurrentUser } from "../../../../src/server/auth/session";
import { prisma } from "../../../../src/server/db/prisma";
import { isSupportedMimeType, listDriveFiles } from "../../../../src/server/google/drive";

const coerceBytes = (size?: string | null) => {
  if (!size) {
    return null;
  }
  try {
    return BigInt(size);
  } catch {
    return null;
  }
};

export const POST = async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const env = getEnv();
  const maxFiles = env.INDEX_MAX_FILES_PER_RUN;
  const maxBytes = env.INDEX_MAX_BYTES_PER_RUN;
  const pageSize = Math.min(env.GOOGLE_DRIVE_PAGE_SIZE, maxFiles);

  const existingState = await prisma.indexState.findUnique({
    where: {
      userId: user.id,
    },
  });

  const { files, nextPageToken } = await listDriveFiles({
    userId: user.id,
    pageToken: existingState?.cursor ?? undefined,
    pageSize,
  });

  let startIndex = 0;
  if (existingState?.lastFileId) {
    const index = files.findIndex((file) => file.id === existingState.lastFileId);
    startIndex = index >= 0 ? index + 1 : 0;
  }

  const candidates = files.slice(startIndex);
  const limitedFiles = [];
  let bytesProcessed = 0;
  for (const file of candidates) {
    if (limitedFiles.length >= maxFiles) {
      break;
    }
    const sizeBytes = coerceBytes(file.size);
    if (sizeBytes) {
      if (bytesProcessed + Number(sizeBytes) > maxBytes) {
        break;
      }
      bytesProcessed += Number(sizeBytes);
    }
    limitedFiles.push(file);
  }

  const existingRefs = await prisma.driveFileRef.findMany({
    where: {
      userId: user.id,
      driveFileId: {
        in: limitedFiles.map((file) => file.id),
      },
    },
  });
  const existingById = new Map(existingRefs.map((ref) => [ref.driveFileId, ref]));

  let lastProcessedId: string | null = null;
  let newOrUpdated = 0;
  const operations = limitedFiles.map((file) => {
    const supported = isSupportedMimeType(file.mimeType);
    const existing = existingById.get(file.id);
    const status = supported ? existing?.status ?? "NEW" : "SKIPPED";
    const lastError = supported
      ? existing?.status === "SKIPPED"
        ? existing.lastError
        : null
      : `Unsupported mime type: ${file.mimeType ?? "unknown"}`;
    const contentStatus = supported
      ? existing?.contentStatus ?? "PENDING"
      : "SKIPPED";
    const contentLastError = supported
      ? existing?.contentLastError ?? null
      : `Unsupported mime type: ${file.mimeType ?? "unknown"}`;

    lastProcessedId = file.id;
    newOrUpdated += 1;

    return prisma.driveFileRef.upsert({
      where: {
        userId_driveFileId: {
          userId: user.id,
          driveFileId: file.id,
        },
      },
      update: {
        name: file.name ?? "Untitled",
        mimeType: file.mimeType ?? "application/octet-stream",
        modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
        sizeBytes: coerceBytes(file.size),
        checksum: file.md5Checksum ?? null,
        status,
        lastError,
        contentStatus,
        contentLastError,
      },
      create: {
        userId: user.id,
        driveFileId: file.id,
        name: file.name ?? "Untitled",
        mimeType: file.mimeType ?? "application/octet-stream",
        modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
        sizeBytes: coerceBytes(file.size),
        checksum: file.md5Checksum ?? null,
        status,
        lastError,
        contentStatus,
        contentLastError,
      },
    });
  });

  if (operations.length) {
    await prisma.$transaction(operations);
  }

  const processed = limitedFiles.length;
  const finishedPage = startIndex + processed >= files.length;
  const done = finishedPage && !nextPageToken;
  const cursor = finishedPage ? nextPageToken : existingState?.cursor ?? null;

  await prisma.indexState.upsert({
    where: {
      userId: user.id,
    },
    update: {
      cursor: cursor ?? null,
      lastRunAt: new Date(),
      lastFileId: finishedPage ? null : lastProcessedId,
      statsJson: {
        processed,
        newOrUpdated,
        bytesProcessed,
      },
    },
    create: {
      userId: user.id,
      cursor: cursor ?? null,
      lastRunAt: new Date(),
      lastFileId: finishedPage ? null : lastProcessedId,
      statsJson: {
        processed,
        newOrUpdated,
        bytesProcessed,
      },
    },
  });

  return NextResponse.json({
    processed,
    newOrUpdated,
    cursor,
    done,
  });
};
