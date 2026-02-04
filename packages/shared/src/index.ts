import { z } from "zod";

export const EntryStatus = z.enum(["processing", "ready", "error"]);
export type EntryStatus = z.infer<typeof EntryStatus>;

export const DriveWriteStatus = z.enum(["ok", "pending", "failed"]);
export type DriveWriteStatus = z.infer<typeof DriveWriteStatus>;

export const EntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  status: EntryStatus,
  driveWriteStatus: DriveWriteStatus,
  driveFileId: z.string().nullable(),
  summaryMarkdown: z.string().nullable(),
  keyPoints: z.array(z.string()),
  metadataRefs: z.array(z.string()),
  startDate: z.string(),
  endDate: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type Entry = z.infer<typeof EntrySchema>;

export const EntrySourceRefSchema = z.object({
  id: z.string(),
  entryId: z.string(),
  sourceType: z.enum(["gmail", "drive"]),
  sourceId: z.string(),
  subject: z.string().nullable().optional(),
  from: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  createdTime: z.string().nullable().optional(),
  modifiedTime: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  internalDate: z.string().nullable().optional(),
  createdAt: z.string()
});

export type EntrySourceRef = z.infer<typeof EntrySourceRefSchema>;

export const GmailResultSchema = z.object({
  messageId: z.string(),
  threadId: z.string().nullable(),
  internalDate: z.string().nullable(),
  subject: z.string().nullable(),
  from: z.string().nullable(),
  date: z.string().nullable()
});

export type GmailResult = z.infer<typeof GmailResultSchema>;

export const DriveResultSchema = z.object({
  fileId: z.string(),
  name: z.string().nullable(),
  mimeType: z.string().nullable(),
  modifiedTime: z.string().nullable(),
  createdTime: z.string().nullable(),
  size: z.string().nullable()
});

export type DriveResult = z.infer<typeof DriveResultSchema>;

export const SearchResultSchema = z.object({
  source: z.enum(["gmail", "drive"]),
  metadataOnly: z.boolean(),
  results: z.array(z.union([GmailResultSchema, DriveResultSchema])),
  nextPageToken: z.string().nullable().optional()
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const PromptSchema = z.object({
  id: z.string(),
  key: z.string(),
  version: z.number(),
  content: z.string(),
  model: z.string(),
  maxTokens: z.number(),
  active: z.boolean(),
  userSelectable: z.boolean(),
  createdAt: z.string()
});

export type Prompt = z.infer<typeof PromptSchema>;

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional()
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ApiErrorResponseSchema = z.object({
  error: ApiErrorSchema
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
