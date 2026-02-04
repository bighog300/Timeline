if (process.env.NODE_ENV !== "test" && process.env.SHIM_ALLOW !== "1") {
  throw new Error(
    "@prisma/client shim is test-only. Set SHIM_ALLOW=1 only for restricted dev environments."
  );
}

const crypto = require("crypto");

const sortByDateDesc = (items, key) =>
  [...items].sort((a, b) => b[key].getTime() - a[key].getTime());

const mapToList = (map) => Array.from(map.values());

const findUniqueBy = (map, where) => {
  const [field, value] = Object.entries(where)[0];
  return mapToList(map).find((item) => item[field] === value) ?? null;
};

const updateItem = (item, data) => Object.assign(item, data);

const clone = (value) => (typeof structuredClone === "function" ? structuredClone(value) : value);

const matchesWhere = (item, where) =>
  Object.entries(where).every(([field, value]) => {
    if (value && typeof value === "object") {
      if ("lt" in value) {
        return item[field] < value.lt;
      }
      if ("in" in value && Array.isArray(value.in)) {
        return value.in.includes(item[field]);
      }
    }
    return item[field] === value;
  });

const createModel = ({ idKey = "id", defaultValues = () => ({}) } = {}) => {
  const store = new Map();

  const create = async ({ data }) => {
    const record = { ...defaultValues(), ...clone(data) };
    store.set(record[idKey], record);
    return record;
  };

  const upsert = async ({ where, create: createData, update }) => {
    const existing = findUniqueBy(store, where);
    if (existing) {
      return updateItem(existing, clone(update));
    }
    return create({ data: createData });
  };

  const update = async ({ where, data }) => {
    const existing = findUniqueBy(store, where);
    if (!existing) {
      throw new Error("Record not found");
    }
    return updateItem(existing, clone(data));
  };

  const updateMany = async ({ where, data }) => {
    let count = 0;
    mapToList(store).forEach((item) => {
      const matches = matchesWhere(item, where);
      if (matches) {
        updateItem(item, clone(data));
        count += 1;
      }
    });
    return { count };
  };

  const findMany = async ({ where, orderBy } = {}) => {
    let items = mapToList(store);
    if (where) {
      items = items.filter((item) => matchesWhere(item, where));
    }
    if (orderBy) {
      const [field] = Object.keys(orderBy);
      items = sortByDateDesc(items, field);
    }
    return items;
  };

  const findUnique = async ({ where }) => findUniqueBy(store, where);
  const findFirst = async ({ where, orderBy } = {}) => {
    const items = await findMany({ where, orderBy });
    return items[0] ?? null;
  };

  const deleteRecord = async ({ where }) => {
    const existing = findUniqueBy(store, where);
    if (!existing) {
      throw new Error("Record not found");
    }
    store.delete(existing[idKey]);
    return existing;
  };

  const deleteMany = async ({ where }) => {
    let count = 0;
    mapToList(store).forEach((item) => {
      if (!where) {
        store.delete(item[idKey]);
        count += 1;
        return;
      }
      const matches = matchesWhere(item, where);
      if (matches) {
        store.delete(item[idKey]);
        count += 1;
      }
    });
    return { count };
  };

  const count = async ({ where } = {}) => (await findMany({ where })).length;

  return {
    create,
    upsert,
    update,
    updateMany,
    findMany,
    findUnique,
    findFirst,
    delete: deleteRecord,
    deleteMany,
    count,
    _store: store
  };
};

class PrismaClient {
  constructor() {
    this.user = createModel({
      idKey: "id",
      defaultValues: () => ({
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date()
      })
    });

    this.session = createModel({
      idKey: "id",
      defaultValues: () => ({
        createdAt: new Date()
      })
    });

    this.googleTokenSet = createModel({
      idKey: "userId",
      defaultValues: () => ({
        createdAt: new Date(),
        updatedAt: new Date()
      })
    });

    this.timelineEntry = createModel({
      idKey: "id",
      defaultValues: () => ({
        createdAt: new Date(),
        updatedAt: new Date()
      })
    });

    this.entrySourceRef = createModel({ idKey: "id" });
    this.derivedArtifact = createModel({ idKey: "id" });

    this.promptVersion = createModel({
      idKey: "id",
      defaultValues: () => ({
        createdAt: new Date()
      })
    });

    this.indexPack = createModel({
      idKey: "id",
      defaultValues: () => ({
        createdAt: new Date()
      })
    });
  }

  $transaction(ops) {
    return Promise.all(ops);
  }

  async $disconnect() {}
}

PrismaClient.__isShim = true;

module.exports = { PrismaClient, __isShim: true };
