import { z } from "zod";

export const EntryStatus = z.enum(["processing", "ready", "error"]);
export const DriveWriteStatus = z.enum(["ok", "pending", "failed"]);

export const EntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: EntryStatus,
  driveWriteStatus: DriveWriteStatus,
  driveFileId: z.string().nullable(),
  summaryMarkdown: z.string().nullable(),
  keyPoints: z.array(z.string()),
  metadataRefs: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type Entry = z.infer<typeof EntrySchema>;

export const PromptSchema = z.object({
  id: z.string(),
  key: z.string(),
  version: z.number(),
  content: z.string(),
  active: z.boolean(),
  userSelectable: z.boolean(),
  createdAt: z.string()
});

export type Prompt = z.infer<typeof PromptSchema>;

