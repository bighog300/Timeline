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
  startDate: string;
  endDate: string | null;
  tags: string[];
  driveFileId: string | null;
  summaryMarkdown: string | null;
  keyPoints: string[];
  metadataRefs: string[];
  createdAt: string;
  updatedAt: string;
};

export type EntrySourceRefRecord = {
  id: string;
  entryId: string;
  sourceType: "gmail" | "drive";
  sourceId: string;
  subject?: string | null;
  from?: string | null;
  date?: string | null;
  name?: string | null;
  mimeType?: string | null;
  createdTime?: string | null;
  modifiedTime?: string | null;
  size?: string | null;
  internalDate?: string | null;
  createdAt: string;
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
  model: string;
  maxTokens: number;
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
