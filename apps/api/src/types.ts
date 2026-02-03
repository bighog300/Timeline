export type SessionData = {
  id: string;
  userId: string;
  email: string;
};

export type EntryRecord = {
  id: string;
  userId: string;
  title: string;
  status: "processing" | "ready" | "error";
  driveWriteStatus: "ok" | "pending" | "failed";
  driveFileId: string | null;
  summaryMarkdown: string | null;
  keyPoints: string[];
  metadataRefs: string[];
  createdAt: string;
  updatedAt: string;
};

export type TokenRecord = {
  userId: string;
  encryptedAccessToken: string;
  accessTokenIv: string;
  accessTokenAuthTag: string;
  encryptedRefreshToken: string | null;
  refreshTokenIv: string | null;
  refreshTokenAuthTag: string | null;
  keyVersion: string;
  expiresAt: string;
};

export type PromptRecord = {
  id: string;
  key: string;
  version: number;
  content: string;
  active: boolean;
  userSelectable: boolean;
  createdAt: string;
};

export type IndexPackRecord = {
  id: string;
  userId: string;
  driveFileId: string | null;
  status: "pending" | "ready" | "error";
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  data: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
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
