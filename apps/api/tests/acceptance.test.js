const assert = require("assert");
const crypto = require("crypto");
const { createPrismaStub } = require("./prismaStub");

process.env.ENCRYPTION_KEY_BASE64 = crypto.randomBytes(32).toString("base64");
process.env.KEY_VERSION = "v1";
process.env.SESSION_SECRET = "test-secret";
process.env.ADMIN_EMAILS = "admin@example.com";
process.env.DRIVE_ADAPTER = "stub";
process.env.NODE_ENV = "test";

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
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const setCookie = response.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : null;
  return { response, cookie };
};

const login = async (baseUrl, email) => {
  const { response, cookie } = await request(baseUrl, `/auth/google/callback?email=${email}`);
  assert.strictEqual(response.status, 200);
  assert.ok(cookie);
  return cookie;
};

(async () => {
  const { server, context, baseUrl, prisma, pool } = await startServer();

  try {
    const userCookie = await login(baseUrl, "user@example.com");

    const metadataRes = await request(baseUrl, "/search/gmail", { cookie: userCookie });
    const metadataBody = await metadataRes.response.json();
    assert.strictEqual(metadataBody.metadataOnly, true);

    const driveMetadataRes = await request(baseUrl, "/search/drive", { cookie: userCookie });
    const driveMetadataBody = await driveMetadataRes.response.json();
    assert.strictEqual(driveMetadataBody.metadataOnly, true);

    const entryRes = await request(baseUrl, "/entries", {
      method: "POST",
      cookie: userCookie,
      body: { title: "First" }
    });
    const entry = await entryRes.response.json();

    const runOne = await request(baseUrl, `/entries/${entry.id}/run`, { method: "POST", cookie: userCookie });
    const runOneBody = await runOne.response.json();
    const createCountAfterFirst = context.driveClient.stats.createCount;
    const updateCountAfterFirst = context.driveClient.stats.updateCount;

    assert.strictEqual(runOneBody.status, "ready");
    assert.strictEqual(runOneBody.driveWriteStatus, "ok");

    const runTwo = await request(baseUrl, `/entries/${entry.id}/run`, { method: "POST", cookie: userCookie });
    const runTwoBody = await runTwo.response.json();

    assert.strictEqual(runTwoBody.driveFileId, runOneBody.driveFileId);
    assert.strictEqual(context.driveClient.stats.createCount, createCountAfterFirst);
    assert.strictEqual(context.driveClient.stats.updateCount, updateCountAfterFirst + 1);

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
