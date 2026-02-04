import crypto from "crypto";
import { google } from "googleapis";
import type { GoogleApiClient } from "./googleApi";

export type DriveStats = {
  createCount: number;
  updateCount: number;
};

export type DriveFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};

export type DriveFile = {
  id: string;
  name: string;
  parentId: string;
  mimeType: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type DriveClient = {
  stats: DriveStats;
  ensureFolder: (name: string, parentId: string) => Promise<DriveFolder>;
  ensureTimelineFolders: () => Promise<{
    rootFolderId: string;
    summariesFolderId: string;
    indexesFolderId: string;
  }>;
  createFile: (input: { name: string; parentId: string; content: string; mimeType: string }) => Promise<DriveFile>;
  updateFile: (input: { fileId: string; content: string }) => Promise<DriveFile>;
  getFile: (fileId: string) => Promise<DriveFile | undefined>;
};

const folderNames = {
  root: "Timeline App/",
  summaries: "Summaries/",
  indexes: "Indexes/"
};

export const createDriveStub = (): DriveClient => {
  const stats: DriveStats = { createCount: 0, updateCount: 0 };
  const now = () => new Date().toISOString();
  const folders: Record<string, DriveFolder> = {
    root: { id: "root", name: "root", parentId: null, createdAt: now() }
  };
  const files: Record<string, DriveFile> = {};

  const ensureFolder = async (name: string, parentId: string) => {
    const existing = Object.values(folders).find((folder) => folder.name === name && folder.parentId === parentId);
    if (existing) {
      return existing;
    }
    const folder: DriveFolder = {
      id: crypto.randomUUID(),
      name,
      parentId,
      createdAt: now()
    };
    folders[folder.id] = folder;
    return folder;
  };

  const ensureTimelineFolders = async () => {
    const rootFolder = folders.root;
    const timelineFolder = await ensureFolder(folderNames.root, rootFolder.id);
    const summariesFolder = await ensureFolder(folderNames.summaries, timelineFolder.id);
    const indexesFolder = await ensureFolder(folderNames.indexes, timelineFolder.id);
    return {
      rootFolderId: timelineFolder.id,
      summariesFolderId: summariesFolder.id,
      indexesFolderId: indexesFolder.id
    };
  };

  const createFile = async (input: { name: string; parentId: string; content: string; mimeType: string }) => {
    const timestamp = now();
    const file: DriveFile = {
      id: crypto.randomUUID(),
      name: input.name,
      parentId: input.parentId,
      mimeType: input.mimeType,
      content: input.content,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1
    };
    files[file.id] = file;
    stats.createCount += 1;
    return file;
  };

  const updateFile = async (input: { fileId: string; content: string }) => {
    const file = files[input.fileId];
    if (!file) {
      throw new Error("drive_file_missing");
    }
    file.content = input.content;
    file.updatedAt = now();
    file.version += 1;
    stats.updateCount += 1;
    return file;
  };

  const getFile = async (fileId: string) => files[fileId];

  return { stats, ensureFolder, ensureTimelineFolders, createFile, updateFile, getFile };
};

export const createGoogleDriveClient = (auth: GoogleApiClient): DriveClient => {
  const stats: DriveStats = { createCount: 0, updateCount: 0 };
  const now = () => new Date().toISOString();

  const drive = google.drive({ version: "v3", auth });

  const ensureFolder = async (name: string, parentId: string) => {
    const result = await drive.files.list({
      q: `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`,
      fields: "files(id, name)"
    });
    const existing = result.data.files?.[0];
    if (existing?.id) {
      return { id: existing.id, name: existing.name ?? name, parentId, createdAt: now() };
    }

    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId]
      },
      fields: "id, name"
    });

    if (!created.data.id) {
      throw new Error("drive_folder_create_failed");
    }

    return { id: created.data.id, name: created.data.name ?? name, parentId, createdAt: now() };
  };

  const ensureTimelineFolders = async () => {
    const rootFolderId = "root";
    const timelineFolder = await ensureFolder(folderNames.root, rootFolderId);
    const summariesFolder = await ensureFolder(folderNames.summaries, timelineFolder.id);
    const indexesFolder = await ensureFolder(folderNames.indexes, timelineFolder.id);
    return {
      rootFolderId: timelineFolder.id,
      summariesFolderId: summariesFolder.id,
      indexesFolderId: indexesFolder.id
    };
  };

  const createFile = async (input: { name: string; parentId: string; content: string; mimeType: string }) => {
    const created = await drive.files.create({
      requestBody: {
        name: input.name,
        parents: [input.parentId],
        mimeType: input.mimeType
      },
      media: {
        mimeType: input.mimeType,
        body: input.content
      },
      fields: "id, name, mimeType, createdTime, modifiedTime"
    });

    if (!created.data.id) {
      throw new Error("drive_file_create_failed");
    }

    stats.createCount += 1;
    return {
      id: created.data.id,
      name: created.data.name ?? input.name,
      parentId: input.parentId,
      mimeType: created.data.mimeType ?? input.mimeType,
      content: input.content,
      createdAt: created.data.createdTime ?? now(),
      updatedAt: created.data.modifiedTime ?? now(),
      version: 1
    };
  };

  const updateFile = async (input: { fileId: string; content: string }) => {
    const updated = await drive.files.update({
      fileId: input.fileId,
      media: {
        mimeType: "text/markdown",
        body: input.content
      },
      fields: "id, name, mimeType, createdTime, modifiedTime"
    });

    if (!updated.data.id) {
      throw new Error("drive_file_update_failed");
    }

    stats.updateCount += 1;
    return {
      id: updated.data.id,
      name: updated.data.name ?? "",
      parentId: "",
      mimeType: updated.data.mimeType ?? "text/markdown",
      content: input.content,
      createdAt: updated.data.createdTime ?? now(),
      updatedAt: updated.data.modifiedTime ?? now(),
      version: 1
    };
  };

  const getFile = async (fileId: string) => {
    const file = await drive.files.get({ fileId, fields: "id, name, parents, mimeType, createdTime, modifiedTime" });
    if (!file.data.id) {
      return undefined;
    }
    return {
      id: file.data.id,
      name: file.data.name ?? "",
      parentId: file.data.parents?.[0] ?? "",
      mimeType: file.data.mimeType ?? "",
      content: "",
      createdAt: file.data.createdTime ?? now(),
      updatedAt: file.data.modifiedTime ?? now(),
      version: 1
    };
  };

  return { stats, ensureFolder, ensureTimelineFolders, createFile, updateFile, getFile };
};

export const createDriveClient = (options?: { auth?: GoogleApiClient }) => {
  if (process.env.DRIVE_ADAPTER === "google") {
    if (!options?.auth) {
      throw new Error("drive_auth_missing");
    }
    return createGoogleDriveClient(options.auth);
  }
  return createDriveStub();
};
