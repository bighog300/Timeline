if (process.env.NODE_ENV !== "test" && process.env.SHIM_ALLOW !== "1") {
  throw new Error(
    "googleapis shim is test-only. Set SHIM_ALLOW=1 only for restricted dev environments."
  );
}

class JwtStub {
  constructor(options) {
    this.options = options;
  }
}

const buildFilesApi = () => ({
  list: async () => ({ data: { files: [] } }),
  create: async () => ({ data: {} }),
  update: async () => ({ data: {} }),
  get: async () => ({ data: {} })
});

const google = {
  auth: {
    JWT: JwtStub
  },
  drive: () => ({
    files: buildFilesApi()
  })
};

module.exports = { google, __isShim: true };
