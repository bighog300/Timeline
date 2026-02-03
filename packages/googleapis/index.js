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

module.exports = { google };
