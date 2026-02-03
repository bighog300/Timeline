const assert = require("assert");
const crypto = require("crypto");
const { newDb } = require("pg-mem");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

process.env.ENCRYPTION_KEY_BASE64 = crypto.randomBytes(32).toString("base64");
process.env.KEY_VERSION = "v1";
process.env.SESSION_SECRET = "test-secret";
process.env.ADMIN_EMAILS = "admin@example.com";
process.env.DRIVE_ADAPTER = "stub";

const { createApp } = require("../src/app");
const { createDriveStub } = require("../src/drive");

const initTestDatabase = () => {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.none(`
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      email text UNIQUE NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE sessions (
      id text PRIMARY KEY,
      user_id uuid,
      data jsonb NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE google_token_sets (
      user_id uuid PRIMARY KEY,
      access_ciphertext text NOT NULL,
      access_iv text NOT NULL,
      access_auth_tag text NOT NULL,
      refresh_ciphertext text,
      refresh_iv text,
      refresh_auth_tag text,
      key_version text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      CONSTRAINT google_token_sets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE timeline_entries (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL,
      title text NOT NULL,
      status text NOT NULL,
      drive_write_status text NOT NULL,
      drive_file_id text,
      summary_markdown text,
      key_points text[] NOT NULL,
      metadata_refs text[] NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      CONSTRAINT timeline_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE entry_source_refs (
      id uuid PRIMARY KEY,
      entry_id uuid NOT NULL,
      source_type text NOT NULL,
      source_id text NOT NULL,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT entry_source_refs_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES timeline_entries(id)
    );

    CREATE TABLE derived_artifacts (
      id uuid PRIMARY KEY,
      entry_id uuid NOT NULL,
      kind text NOT NULL,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT derived_artifacts_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES timeline_entries(id)
    );

    CREATE TABLE prompt_versions (
      id uuid PRIMARY KEY,
      key text NOT NULL,
      version integer NOT NULL,
      content text NOT NULL,
      active boolean DEFAULT false,
      user_selectable boolean DEFAULT true,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE index_packs (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL,
      drive_file_id text,
      status text NOT NULL,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT index_packs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  return { prisma, pool };
};

const startServer = () =>
  new Promise((resolve) => {
    const { prisma, pool } = initTestDatabase();
    const { app, context } = createApp({ driveClient: createDriveStub(), prisma });
    const server = app.listen(0, () => {
      const address = server.address();
      resolve({
        server,
        context,
        prisma,
        pool,
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

    const runTwo = await request(baseUrl, `/entries/${entry.id}/run`, { method: "POST", cookie: userCookie });
    const runTwoBody = await runTwo.response.json();

    assert.strictEqual(runTwoBody.driveFileId, runOneBody.driveFileId);
    assert.strictEqual(context.driveClient.stats.createCount, createCountAfterFirst);
    assert.strictEqual(context.driveClient.stats.updateCount, updateCountAfterFirst + 1);

    await prisma.googleTokenSet.delete({ where: { userId: runTwoBody.userId } });
    const missingTokenRun = await request(baseUrl, `/entries/${entry.id}/run`, {
      method: "POST",
      cookie: userCookie
    });
    const missingTokenBody = await missingTokenRun.response.json();
    assert.strictEqual(missingTokenRun.response.status, 401);
    assert.strictEqual(missingTokenBody.error.code, "reconnect_required");

    const adminDenied = await request(baseUrl, "/admin/prompts", { cookie: userCookie });
    assert.strictEqual(adminDenied.response.status, 403);

    const adminCookie = await login(baseUrl, "admin@example.com");
    const adminPrompts = await request(baseUrl, "/admin/prompts", { cookie: adminCookie });
    assert.strictEqual(adminPrompts.response.status, 200);

    console.log("acceptance tests complete");
  } finally {
    server.close();
    await prisma.$disconnect();
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
