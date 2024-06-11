const nodecache = require("node-cache");

const cacheInterface = require("./cacheinterface");
const {
  fetchAllTransactionsIDs,
  fetchTransactionById,
  upsertTransaction,
} = require("./dbServices");
const { parseBoolean } = require("./../utils/utils");

const defaultCacheOptions = { stdTTL: 100, checkperiod: 120 };
const USE_DB = parseBoolean(process.env.USE_DB);
class NodeCacheAdapter extends cacheInterface {
  constructor(options) {
    super();
    this.cache = new nodecache(options);
  }

  async get(key) {
    if (USE_DB) {
      if (key === undefined || key === "") {
        return await fetchAllTransactionsIDs();
      }
      return await fetchTransactionById(key);
    } else {
      if (key === undefined || key === "") {
        return this.cache.keys();
      }
      return this.cache.get(key);
    }
  }

  async set(uniqueIdentifier, data, ttl) {
    if (USE_DB) {
      await upsertTransaction(data);
    } else {
      this.cache.set(uniqueIdentifier, data, ttl);
    }
  }
}

const cache = new NodeCacheAdapter(defaultCacheOptions);

module.exports = { cache };
