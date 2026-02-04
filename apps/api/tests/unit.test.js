process.env.NODE_ENV = "test";

const assert = require("assert");
const crypto = require("crypto");

const { getSessionSecret } = require("../src/sessions");
const { createGoogleDriveClient } = require("../src/drive");
const { createOpenAIClient } = require("../src/openai");
const { google } = require("googleapis");

const withEnv = async (vars, fn) => {
  const previous = {};
  Object.keys(vars).forEach((key) => {
    previous[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  });

  try {
    return await fn();
  } finally {
    Object.keys(vars).forEach((key) => {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    });
  }
};

const runTests = async () => {
  await withEnv({ NODE_ENV: "production", SESSION_SECRET: "" }, async () => {
    assert.throws(() => getSessionSecret(), /SESSION_SECRET/);
  });

  await withEnv({ NODE_ENV: "production", SESSION_SECRET: "dev-secret" }, async () => {
    assert.throws(() => getSessionSecret(), /SESSION_SECRET/);
  });

  await withEnv({ NODE_ENV: "development", SESSION_SECRET: "" }, async () => {
    assert.strictEqual(getSessionSecret(), "dev-secret");
  });

  await withEnv({ NODE_ENV: "production", SESSION_SECRET: crypto.randomBytes(32).toString("hex") }, async () => {
    assert.ok(getSessionSecret().length >= 32);
  });

  const originalDrive = google.drive;
  try {
    google.drive = () => ({
      files: {
        list: async () => ({ data: { files: [] } }),
        create: async () => ({
          data: {
            id: "file-1",
            parents: ["parent-1"],
            version: "7",
            name: "Doc",
            mimeType: "text/plain",
            createdTime: "2024-01-01T00:00:00Z",
            modifiedTime: "2024-01-01T00:00:00Z"
          }
        }),
        update: async () => ({
          data: {
            id: "file-1",
            parents: ["parent-1"],
            version: "8",
            name: "Doc",
            mimeType: "text/plain",
            createdTime: "2024-01-01T00:00:00Z",
            modifiedTime: "2024-01-02T00:00:00Z"
          }
        }),
        get: async () => ({
          data: {
            id: "file-1",
            parents: ["parent-1"],
            version: "8",
            name: "Doc",
            mimeType: "text/plain",
            createdTime: "2024-01-01T00:00:00Z",
            modifiedTime: "2024-01-02T00:00:00Z"
          }
        })
      }
    });

    const driveClient = createGoogleDriveClient({});
    const created = await driveClient.createFile({
      name: "Doc",
      parentId: "parent-1",
      content: "hello",
      mimeType: "text/plain"
    });
    assert.strictEqual(created.id, "file-1");
    assert.strictEqual(created.parentId, "parent-1");
    assert.strictEqual(created.version, 7);

    const updated = await driveClient.updateFile({ fileId: "file-1", content: "next" });
    assert.strictEqual(updated.parentId, "parent-1");
    assert.strictEqual(updated.version, 8);
  } finally {
    google.drive = originalDrive;
  }

  const originalDriveMissing = google.drive;
  try {
    google.drive = () => ({
      files: {
        list: async () => ({ data: { files: [] } }),
        create: async () => ({ data: { id: "file-2", name: "Doc" } }),
        update: async () => ({ data: { id: "file-2" } }),
        get: async () => ({ data: { id: "file-2" } })
      }
    });

    const driveClient = createGoogleDriveClient({});
    const created = await driveClient.createFile({
      name: "Doc",
      parentId: "parent-2",
      content: "hello",
      mimeType: "text/plain"
    });
    assert.strictEqual(created.parentId, "parent-2");
    assert.strictEqual(created.version, null);

    const updated = await driveClient.updateFile({ fileId: "file-2", content: "next" });
    assert.strictEqual(updated.parentId, null);
    assert.strictEqual(updated.version, null);
  } finally {
    google.drive = originalDriveMissing;
  }

  await withEnv(
    {
      NODE_ENV: "development",
      OPENAI_API_KEY: "test-key",
      OPENAI_STUB: "0",
      OPENAI_TIMEOUT_MS: "5"
    },
    async () => {
      let fetchCalls = 0;
      const originalFetch = global.fetch;
      global.fetch = (url, options) => {
        fetchCalls += 1;
        return new Promise((resolve, reject) => {
          if (options?.signal) {
            if (options.signal.aborted) {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
              return;
            }
            options.signal.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }
        });
      };

      try {
        const client = createOpenAIClient();
        await assert.rejects(
          () =>
            client.runChat({
              model: "gpt-4o-mini",
              maxTokens: 10,
              messages: [{ role: "user", content: "Hi" }]
            }),
          /openai_request_failed/
        );
        assert.strictEqual(fetchCalls, 2);
      } finally {
        global.fetch = originalFetch;
      }
    }
  );

  await withEnv({ NODE_ENV: "development", OPENAI_API_KEY: "test-key", OPENAI_STUB: "0" }, async () => {
    let fetchCalls = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return { ok: false, status: 429, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"summaryMarkdown":"ok","keyPoints":[]}' } }],
          usage: { prompt_tokens: 1, completion_tokens: 2 }
        })
      };
    };

    try {
      const client = createOpenAIClient();
      const response = await client.runChat({
        model: "gpt-4o-mini",
        maxTokens: 10,
        messages: [{ role: "user", content: "Hi" }]
      });
      assert.strictEqual(fetchCalls, 2);
      assert.ok(response.output.includes("summaryMarkdown"));
    } finally {
      global.fetch = originalFetch;
    }
  });

  await withEnv({ NODE_ENV: "development", OPENAI_API_KEY: "test-key", OPENAI_STUB: "0" }, async () => {
    let fetchCalls = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => {
      fetchCalls += 1;
      return { ok: false, status: 500, json: async () => ({}) };
    };

    try {
      const client = createOpenAIClient();
      await assert.rejects(
        () =>
          client.runChat({
            model: "gpt-4o-mini",
            maxTokens: 10,
            messages: [{ role: "user", content: "Hi" }]
          }),
        /openai_request_failed/
      );
      assert.strictEqual(fetchCalls, 2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  console.log("unit tests complete");
};

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
