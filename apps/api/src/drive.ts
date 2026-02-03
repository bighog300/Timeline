import crypto from "crypto";
import { db, saveDb } from "./db";
import type { DriveFile, DriveFolder } from "./types";

export type DriveStats = {
  createCount: number;
  updateCount: number;
};

export type DriveClient = {
  stats: DriveStats;
  ensureFolder: (name: string, parentId: string) => DriveFolder;
  ensureTimelineFolders: () => { rootFolderId: string; summariesFolderId: string };
  createFile: (input: { name: string; parentId: string; content: string; mimeType: string }) => DriveFile;
  updateFile: (input: { fileId: string; content: string }) => DriveFile;
  getFile: (fileId: string) => DriveFile | undefined;
};

export const createDriveClient = (): DriveClient => {
  const stats: DriveStats = { createCount: 0, updateCount: 0 };

  const ensureFolder = (name: string, parentId: string) => {
    const existing = Object.values(db.drive.folders).find(
      (folder) => folder.name === name && folder.parentId === parentId
    );
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const folder: DriveFolder = {
      id: crypto.randomUUID(),
      name,
      parentId,
      createdAt: now
    };
    db.drive.folders[folder.id] = folder;
    saveDb();
    return folder;
  };

  const ensureTimelineFolders = () => {
    const rootFolder = db.drive.folders.root;
    const timelineFolder = ensureFolder("Timeline App", rootFolder.id);
    const summariesFolder = ensureFolder("Summaries", timelineFolder.id);
    return { rootFolderId: timelineFolder.id, summariesFolderId: summariesFolder.id };
  };

  const createFile = (input: { name: string; parentId: string; content: string; mimeType: string }) => {
    const now = new Date().toISOString();
    const file: DriveFile = {
      id: crypto.randomUUID(),
      name: input.name,
      parentId: input.parentId,
      mimeType: input.mimeType,
      content: input.content,
      createdAt: now,
      updatedAt: now,
      version: 1
    };
    db.drive.files[file.id] = file;
    stats.createCount += 1;
    saveDb();
    return file;
  };

  const updateFile = (input: { fileId: string; content: string }) => {
    const file = db.drive.files[input.fileId];
    if (!file) {
      throw new Error("drive_file_missing");
    }
    file.content = input.content;
    file.updatedAt = new Date().toISOString();
    file.version += 1;
    stats.updateCount += 1;
    saveDb();
    return file;
  };

  const getFile = (fileId: string) => db.drive.files[fileId];

  return { stats, ensureFolder, ensureTimelineFolders, createFile, updateFile, getFile };
};
