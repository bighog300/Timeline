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
      const matches = Object.entries(where).every(([field, value]) => item[field] === value);
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
      items = items.filter((item) =>
        Object.entries(where).every(([field, value]) => item[field] === value)
      );
    }
    if (orderBy) {
      const [field] = Object.keys(orderBy);
      items = sortByDateDesc(items, field);
    }
    return items;
  };

  const findUnique = async ({ where }) => findUniqueBy(store, where);

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
      const matches = Object.entries(where).every(([field, value]) => {
        if (value && typeof value === "object" && "lt" in value) {
          return item[field] < value.lt;
        }
        return item[field] === value;
      });
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
    delete: deleteRecord,
    deleteMany,
    count,
    _store: store
  };
};

const createPrismaStub = () => {
  const user = createModel({
    idKey: "id",
    defaultValues: () => ({
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date()
    })
  });

  const session = createModel({
    idKey: "id",
    defaultValues: () => ({
      createdAt: new Date()
    })
  });

  const googleTokenSet = createModel({
    idKey: "userId",
    defaultValues: () => ({
      createdAt: new Date(),
      updatedAt: new Date()
    })
  });

  const timelineEntry = createModel({
    idKey: "id",
    defaultValues: () => ({
      createdAt: new Date(),
      updatedAt: new Date()
    })
  });

  const entrySourceRef = createModel({ idKey: "id" });
  const derivedArtifact = createModel({ idKey: "id" });

  const promptVersion = createModel({
    idKey: "id",
    defaultValues: () => ({
      createdAt: new Date()
    })
  });

  const indexPack = createModel({
    idKey: "id",
    defaultValues: () => ({
      createdAt: new Date()
    })
  });

  const $transaction = async (ops) => Promise.all(ops);
  const $disconnect = async () => {};

  return {
    user,
    session,
    googleTokenSet,
    timelineEntry,
    entrySourceRef,
    derivedArtifact,
    promptVersion,
    indexPack,
    $transaction,
    $disconnect
  };
};

module.exports = { createPrismaStub };
