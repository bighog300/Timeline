import { getGoogleDriveAccessToken } from "./oauth";

export type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
};

type DriveListResponse = {
  nextPageToken?: string;
  files?: DriveFile[];
};

const DRIVE_FIELDS =
  "nextPageToken,files(id,name,mimeType,modifiedTime,size,md5Checksum)";
const SUPPORTED_MIME_TYPES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/pdf",
  "text/plain",
]);

export const isSupportedMimeType = (mimeType?: string | null) => {
  if (!mimeType) {
    return false;
  }
  return SUPPORTED_MIME_TYPES.has(mimeType);
};

export const listDriveFiles = async ({
  userId,
  pageToken,
  pageSize,
}: {
  userId: string;
  pageToken?: string | null;
  pageSize: number;
}) => {
  const accessToken = await getGoogleDriveAccessToken(userId);
  if (!accessToken) {
    throw new Error("Missing Google Drive connection.");
  }

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("fields", DRIVE_FIELDS);
  url.searchParams.set("q", "trashed = false");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unable to list Google Drive files.");
  }

  const data = (await response.json()) as DriveListResponse;
  return {
    files: data.files ?? [],
    nextPageToken: data.nextPageToken ?? null,
  };
};
