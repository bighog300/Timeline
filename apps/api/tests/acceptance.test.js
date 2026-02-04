const assert = require("assert");
const crypto = require("crypto");
const { createPrismaStub } = require("./prismaStub");

process.env.ENCRYPTION_KEY_BASE64 = crypto.randomBytes(32).toString("base64");
process.env.KEY_VERSION = "v1";
process.env.SESSION_SECRET = "test-secret";
process.env.ADMIN_EMAILS = "admin@example.com";
process.env.DRIVE_ADAPTER = "stub";
process.env.NODE_ENV = "test";
process.env.GOOGLE_API_STUB = "1";
process.env.OPENAI_STUB = "1";

const { createApp } = require("../src/app");
const { createDriveStub } = require("../src/drive");

const initTestDatabase = () => ({
  prisma: createPrismaStub()
});

const startServer = () =>
  new Promise((resolve) => {
    const { prisma } = initTestDatabase();
    const { app, context } = createApp({ driveClient: createDriveStub(), prisma });
    const server = app.listen(0, () => {
      const address = server.address();
      resolve({
        server,
        context,
        prisma,
        baseUrl: `http://127.0.0.1:${address.port}`
      });
    });
  });

const request = async (baseUrl, path, options = {}) => {
  const headers = { ...(options.headers ?? {}) };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  if (options.body) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: "manual"
  });

  const setCookie = response.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : null;
  return { response, cookie, location: response.headers.get("location") };
};

const login = async (baseUrl, email) => {
  const start = await request(baseUrl, "/auth/google/start");
  assert.strictEqual(start.response.status, 302);
  assert.ok(start.cookie);
  assert.ok(start.location);
  const url = new URL(start.location);
  const state = url.searchParams.get("state");
  assert.ok(state);

  const callback = await request(baseUrl, `/auth/google/callback?state=${state}&code=stub&email=${email}` , {
    cookie: start.cookie
  });
  assert.strictEqual(callback.response.status, 302);
  return callback.cookie ?? start.cookie;
};

(async () => {
  const { server, context, baseUrl, prisma } = await startServer();

  try {
    const start = await request(baseUrl, "/auth/google/start");
    const badState = await request(baseUrl, "/auth/google/callback?state=bad&code=stub", {
      cookie: start.cookie
    });
    assert.strictEqual(badState.response.status, 400);

    const adminCookieForSetup = await login(baseUrl, "admin@example.com");
    const createPrompt = await request(baseUrl, "/admin/prompts", {
      method: "POST",
      cookie: adminCookieForSetup,
      body: {
        key: "summary",
        version: 1,
        content: "You are a helpful summarizer.",
        model: "gpt-4o-mini",
        maxTokens: 256,
        userSelectable: true
      }
    });
    const createdPrompt = await createPrompt.response.json();
    await request(baseUrl, `/admin/prompts/${createdPrompt.id}/activate`, {
      method: "PATCH",
      cookie: adminCookieForSetup
    });

    const userCookie = await login(baseUrl, "user@example.com");

    const metadataRes = await request(baseUrl, "/search/gmail", { cookie: userCookie });
    const metadataBody = await metadataRes.response.json();
    assert.strictEqual(metadataBody.metadataOnly, true);
    assert.ok(metadataBody.results.length > 0);
    assert.strictEqual("snippet" in metadataBody.results[0], false);

    const driveMetadataRes = await request(baseUrl, "/search/drive", { cookie: userCookie });
    const driveMetadataBody = await driveMetadataRes.response.json();
    assert.strictEqual(driveMetadataBody.metadataOnly, true);
    assert.ok(driveMetadataBody.results.length > 0);
    assert.strictEqual("body" in driveMetadataBody.results[0], false);

    const entryRes = await request(baseUrl, "/entries", {
      method: "POST",
      cookie: userCookie,
      body: { title: "First", startDate: new Date().toISOString(), tags: ["work"] }
    });
    const entry = await entryRes.response.json();

    const attachRes = await request(baseUrl, `/entries/${entry.id}/sources`, {
      method: "POST",
      cookie: userCookie,
      body: {
        sources: [
          {
            sourceType: "gmail",
            sourceId: metadataBody.results[0].messageId,
            subject: metadataBody.results[0].subject,
            from: metadataBody.results[0].from,
            date: metadataBody.results[0].date
          }
        ]
      }
    });
    const attachBody = await attachRes.response.json();
    assert.strictEqual(attachRes.response.status, 201);
    assert.strictEqual(attachBody.sources.length, 1);

    const runOne = await request(baseUrl, `/entries/${entry.id}/run`, { method: "POST", cookie: userCookie });
    const runOneBody = await runOne.response.json();
    const createCountAfterFirst = context.driveClient.stats.createCount;
    const updateCountAfterFirst = context.driveClient.stats.updateCount;

    assert.strictEqual(runOneBody.status, "ready");
    assert.strictEqual(runOneBody.driveWriteStatus, "ok");
    assert.ok(runOneBody.summaryMarkdown);

    const runTwo = await request(baseUrl, `/entries/${entry.id}/run`, { method: "POST", cookie: userCookie });
    const runTwoBody = await runTwo.response.json();

    assert.strictEqual(runTwoBody.driveFileId, runOneBody.driveFileId);
    assert.strictEqual(context.driveClient.stats.createCount, createCountAfterFirst);
    assert.strictEqual(context.driveClient.stats.updateCount, updateCountAfterFirst + 1);

    const googleStatsBeforeRetry = { ...context.googleApi.stats };
    await prisma.timelineEntry.update({
      where: { id: entry.id },
      data: { driveWriteStatus: "failed", driveFileId: runTwoBody.driveFileId }
    });

    const retryRes = await request(baseUrl, `/entries/${entry.id}/retry-drive-write`, {
      method: "POST",
      cookie: userCookie
    });
    const retryBody = await retryRes.response.json();
    assert.strictEqual(retryBody.driveWriteStatus, "ok");
    assert.strictEqual(context.googleApi.stats.gmailFetchCount, googleStatsBeforeRetry.gmailFetchCount);
    assert.strictEqual(context.googleApi.stats.driveFetchCount, googleStatsBeforeRetry.driveFetchCount);

    const detachRes = await request(baseUrl, `/entries/${entry.id}/sources`, {
      method: "DELETE",
      cookie: userCookie,
      body: { sourceIds: attachBody.sources.map((source) => source.id) }
    });
    const detachBody = await detachRes.response.json();
    assert.strictEqual(detachBody.removed, 1);

    const entryBeforeMissingToken = await prisma.timelineEntry.findUnique({
      where: { id: entry.id }
    });
    const artifactsBeforeMissingToken = await prisma.derivedArtifact.count({
      where: { entryId: entry.id }
    });

    await prisma.googleTokenSet.delete({ where: { userId: runTwoBody.userId } });
    const driveCountsBeforeMissingToken = {
      create: context.driveClient.stats.createCount,
      update: context.driveClient.stats.updateCount
    };
    const missingTokenRun = await request(baseUrl, `/entries/${entry.id}/run`, {
      method: "POST",
      cookie: userCookie
    });
    const missingTokenBody = await missingTokenRun.response.json();
    assert.strictEqual(missingTokenRun.response.status, 401);
    assert.strictEqual(missingTokenBody.error, "reconnect_required");
    assert.strictEqual(context.driveClient.stats.createCount, driveCountsBeforeMissingToken.create);
    assert.strictEqual(context.driveClient.stats.updateCount, driveCountsBeforeMissingToken.update);
    const entryAfterMissingToken = await prisma.timelineEntry.findUnique({
      where: { id: entry.id }
    });
    const artifactsAfterMissingToken = await prisma.derivedArtifact.count({
      where: { entryId: entry.id }
    });
    assert.strictEqual(entryAfterMissingToken.status, entryBeforeMissingToken.status);
    assert.strictEqual(entryAfterMissingToken.driveWriteStatus, entryBeforeMissingToken.driveWriteStatus);
    assert.strictEqual(artifactsAfterMissingToken, artifactsBeforeMissingToken);
    assert.strictEqual(
      new Date(entryAfterMissingToken.updatedAt).getTime(),
      new Date(entryBeforeMissingToken.updatedAt).getTime()
    );

    const adminDenied = await request(baseUrl, "/admin/prompts", { cookie: userCookie });
    assert.strictEqual(adminDenied.response.status, 403);

    const adminCookie = await login(baseUrl, "admin@example.com");
    const adminPrompts = await request(baseUrl, "/admin/prompts", { cookie: adminCookie });
    assert.strictEqual(adminPrompts.response.status, 200);

    console.log("acceptance tests complete");
  } finally {
    server.close();
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
