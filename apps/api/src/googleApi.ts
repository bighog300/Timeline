import { google } from "googleapis";

const oauthScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file"
];

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiryDate: number | null;
};

export type GmailMetadata = {
  messageId: string;
  threadId: string | null;
  internalDate: string | null;
  subject: string | null;
  from: string | null;
  date: string | null;
};

export type DriveMetadata = {
  fileId: string;
  name: string | null;
  mimeType: string | null;
  modifiedTime: string | null;
  createdTime: string | null;
  size: string | null;
};

export type GoogleApiClient = ReturnType<typeof google.auth.OAuth2>;

export type GoogleApi = {
  getOAuthClient: () => GoogleApiClient;
  getAuthUrl: (client: GoogleApiClient, state: string) => string;
  exchangeCode: (client: GoogleApiClient, code: string) => Promise<GoogleTokens>;
  getUserEmail: (client: GoogleApiClient, emailHint?: string | null) => Promise<string>;
  searchGmail: (
    client: GoogleApiClient,
    query: string,
    pageToken: string | null,
    maxResults: number
  ) => Promise<{ results: GmailMetadata[]; nextPageToken?: string | null }>;
  searchDrive: (
    client: GoogleApiClient,
    query: string,
    pageToken: string | null,
    pageSize: number
  ) => Promise<{ results: DriveMetadata[]; nextPageToken?: string | null }>;
  fetchGmailMessage: (
    client: GoogleApiClient,
    messageId: string
  ) => Promise<{ text: string; metadata: GmailMetadata }>;
  fetchDriveFile: (
    client: GoogleApiClient,
    fileId: string,
    mimeType?: string | null
  ) => Promise<{ text: string; metadata: DriveMetadata; skipped: boolean; reason?: string }>;
  stats?: {
    gmailFetchCount: number;
    driveFetchCount: number;
  };
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
};

const stripHtml = (value: string) =>
  value
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractHeaders = (headers: Array<{ name?: string | null; value?: string | null }> | undefined) => {
  const headerMap = new Map<string, string>();
  headers?.forEach((header) => {
    if (header.name) {
      headerMap.set(header.name.toLowerCase(), header.value ?? "");
    }
  });
  return {
    subject: headerMap.get("subject") ?? null,
    from: headerMap.get("from") ?? null,
    date: headerMap.get("date") ?? null
  };
};

const walkParts = (parts: any[] | undefined, collector: string[]) => {
  if (!parts) {
    return;
  }
  parts.forEach((part) => {
    if (part?.parts) {
      walkParts(part.parts, collector);
    }
    if (!part?.mimeType || !part?.body?.data) {
      return;
    }
    if (part.mimeType === "text/plain") {
      collector.push(decodeBase64Url(part.body.data));
    } else if (part.mimeType === "text/html") {
      collector.push(stripHtml(decodeBase64Url(part.body.data)));
    }
  });
};

class StubOAuthClient {
  credentials: Record<string, any> = {};

  setCredentials(credentials: Record<string, any>) {
    this.credentials = { ...this.credentials, ...credentials };
  }

  getAccessToken() {
    return Promise.resolve({ token: this.credentials.access_token ?? "stub-access-token" });
  }
}

const createStubGoogleApi = (): GoogleApi => {
  const stats = { gmailFetchCount: 0, driveFetchCount: 0 };
  return {
    getOAuthClient: () => new StubOAuthClient() as unknown as GoogleApiClient,
    getAuthUrl: (_client, state) => `https://example.test/oauth?state=${state}`,
    exchangeCode: async () => ({
      accessToken: "stub-access-token",
      refreshToken: "stub-refresh-token",
      expiryDate: Date.now() + 60 * 60 * 1000
    }),
    getUserEmail: async (_client, emailHint) => emailHint ?? "stub@example.com",
    searchGmail: async () => ({
      results: [
        {
          messageId: "stub-message-1",
          threadId: "stub-thread-1",
          internalDate: new Date().toISOString(),
          subject: "Stub subject",
          from: "Stub Sender <stub@example.com>",
          date: new Date().toISOString()
        }
      ],
      nextPageToken: null
    }),
    searchDrive: async () => ({
      results: [
        {
          fileId: "stub-file-1",
          name: "Stub Document",
          mimeType: "text/plain",
          modifiedTime: new Date().toISOString(),
          createdTime: new Date().toISOString(),
          size: "128"
        }
      ],
      nextPageToken: null
    }),
    fetchGmailMessage: async (_client, messageId) => {
      stats.gmailFetchCount += 1;
      return {
        text: `Stub gmail content for ${messageId}`,
        metadata: {
          messageId,
          threadId: "stub-thread-1",
          internalDate: new Date().toISOString(),
          subject: "Stub subject",
          from: "Stub Sender <stub@example.com>",
          date: new Date().toISOString()
        }
      };
    },
    fetchDriveFile: async (_client, fileId) => {
      stats.driveFetchCount += 1;
      return {
        text: `Stub drive content for ${fileId}`,
        metadata: {
          fileId,
          name: "Stub Document",
          mimeType: "text/plain",
          modifiedTime: new Date().toISOString(),
          createdTime: new Date().toISOString(),
          size: "128"
        },
        skipped: false
      };
    },
    stats
  };
};

export const createGoogleApi = (): GoogleApi => {
  if (process.env.GOOGLE_API_STUB === "1" || process.env.NODE_ENV === "test") {
    return createStubGoogleApi();
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("google_oauth_env_missing");
  }

  const getOAuthClient = () => new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const getAuthUrl = (client: GoogleApiClient, state: string) =>
    client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: oauthScopes,
      state
    });

  const exchangeCode = async (client: GoogleApiClient, code: string): Promise<GoogleTokens> => {
    const { tokens } = await client.getToken(code);
    return {
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token ?? null,
      expiryDate: tokens.expiry_date ?? null
    };
  };

  const getUserEmail = async (client: GoogleApiClient): Promise<string> => {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const response = await oauth2.userinfo.get();
    if (!response.data.email) {
      throw new Error("google_userinfo_missing");
    }
    return response.data.email;
  };

  const searchGmail = async (
    client: GoogleApiClient,
    query: string,
    pageToken: string | null,
    maxResults: number
  ) => {
    const gmail = google.gmail({ version: "v1", auth: client });
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults,
      pageToken: pageToken ?? undefined
    });
    const messages = listResponse.data.messages ?? [];
    const results: GmailMetadata[] = [];
    for (const message of messages) {
      if (!message.id) {
        continue;
      }
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"]
      });
      const headers = extractHeaders(detail.data.payload?.headers ?? []);
      results.push({
        messageId: message.id,
        threadId: detail.data.threadId ?? null,
        internalDate: detail.data.internalDate ?? null,
        subject: headers.subject,
        from: headers.from,
        date: headers.date
      });
    }
    return { results, nextPageToken: listResponse.data.nextPageToken ?? null };
  };

  const searchDrive = async (
    client: GoogleApiClient,
    query: string,
    pageToken: string | null,
    pageSize: number
  ) => {
    const drive = google.drive({ version: "v3", auth: client });
    const response = await drive.files.list({
      q: query,
      pageSize,
      pageToken: pageToken ?? undefined,
      fields: "nextPageToken, files(id,name,mimeType,modifiedTime,size,createdTime)"
    });
    const files = response.data.files ?? [];
    return {
      results: files.map((file: any) => ({
        fileId: file.id ?? "",
        name: file.name ?? null,
        mimeType: file.mimeType ?? null,
        modifiedTime: file.modifiedTime ?? null,
        createdTime: file.createdTime ?? null,
        size: file.size ?? null
      })),
      nextPageToken: response.data.nextPageToken ?? null
    };
  };

  const fetchGmailMessage = async (client: GoogleApiClient, messageId: string) => {
    const gmail = google.gmail({ version: "v1", auth: client });
    const message = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
    const payload = message.data.payload;
    const headers = extractHeaders(payload?.headers ?? []);
    const textParts: string[] = [];
    if (payload?.body?.data) {
      textParts.push(decodeBase64Url(payload.body.data));
    }
    walkParts(payload?.parts ?? [], textParts);
    return {
      text: textParts.join("\n").trim(),
      metadata: {
        messageId,
        threadId: message.data.threadId ?? null,
        internalDate: message.data.internalDate ?? null,
        subject: headers.subject,
        from: headers.from,
        date: headers.date
      }
    };
  };

  const fetchDriveFile = async (client: GoogleApiClient, fileId: string, mimeType?: string | null) => {
    const drive = google.drive({ version: "v3", auth: client });
    const metaResponse = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,modifiedTime,size,createdTime"
    });
    const meta = metaResponse.data;
    const effectiveMime = mimeType ?? meta.mimeType ?? "";
    const metadata: DriveMetadata = {
      fileId,
      name: meta.name ?? null,
      mimeType: meta.mimeType ?? null,
      modifiedTime: meta.modifiedTime ?? null,
      createdTime: meta.createdTime ?? null,
      size: meta.size ?? null
    };
    const googleDocTypes = new Set([
      "application/vnd.google-apps.document",
      "application/vnd.google-apps.presentation",
      "application/vnd.google-apps.spreadsheet"
    ]);
    if (googleDocTypes.has(effectiveMime)) {
      const exportResponse = await drive.files.export(
        { fileId, mimeType: "text/plain" },
        { responseType: "text" }
      );
      return { text: String(exportResponse.data ?? ""), metadata, skipped: false };
    }
    if (["text/plain", "text/markdown"].includes(effectiveMime)) {
      const download = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
      return { text: String(download.data ?? ""), metadata, skipped: false };
    }
    return { text: "", metadata, skipped: true, reason: "unsupported_mime_type" };
  };

  return {
    getOAuthClient,
    getAuthUrl,
    exchangeCode,
    getUserEmail,
    searchGmail,
    searchDrive,
    fetchGmailMessage,
    fetchDriveFile
  };
};
