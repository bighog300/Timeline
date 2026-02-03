const ALLOWED_FIELDS = new Set([
  "entryCount",
  "durationMs",
  "errorCode",
  "port",
  "entryId",
  "userId",
  "status",
  "driveFileId",
  "driveWriteStatus",
  "indexPackId",
  "reason"
]);

type LogValue = number | string;

const sanitizeFields = (data: Record<string, LogValue>) => {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) => ALLOWED_FIELDS.has(key) && (typeof value === "string" || typeof value === "number")
    )
  );
};

export const logEvent = (name: string, data: Record<string, LogValue> = {}) => {
  const payload = { name, ...sanitizeFields(data) };
  console.log(JSON.stringify(payload));
};
