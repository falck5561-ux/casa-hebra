"use strict";

const { createDefaultData } = require("./defaults");
const { normalizeLoadedData } = require("./store");

function clone(value) {
  return structuredClone(value);
}

function databaseConfig(env = process.env) {
  const enabled = String(env.SUPABASE_DATABASE_ENABLED || "").toLowerCase() === "true";
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const table = String(env.SUPABASE_DATABASE_TABLE || "casa_hebra_store").trim();
  return { enabled, url, serviceKey, table, configured: enabled && Boolean(url && serviceKey && table) };
}

class SupabaseStore {
  constructor(config = databaseConfig()) {
    this.config = config;
    this.data = null;
    this.writeQueue = Promise.resolve();
  }

  headers(extra = {}) {
    return {
      apikey: this.config.serviceKey,
      Authorization: `Bearer ${this.config.serviceKey}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  endpoint(query = "") {
    return `${this.config.url}/rest/v1/${encodeURIComponent(this.config.table)}${query}`;
  }

  async request(url, options = {}) {
    let response;
    try {
      response = await fetch(url, { ...options, headers: this.headers(options.headers) });
    } catch (error) {
      const cause = error && error.cause;
      const detail = cause && (cause.code || cause.message) ? ` (${cause.code || cause.message})` : "";
      throw new Error(`No fue posible conectar con Supabase Database${detail}.`, { cause: error });
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Supabase Database respondió ${response.status}: ${body || response.statusText}`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async init() {
    if (!this.config.configured) {
      throw new Error("Supabase Database está habilitado pero faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o SUPABASE_DATABASE_TABLE.");
    }
    const rows = await this.request(this.endpoint("?id=eq.main&select=data&limit=1"), { method: "GET" });
    if (Array.isArray(rows) && rows[0] && rows[0].data) {
      this.data = normalizeLoadedData(rows[0].data);
      return this;
    }
    this.data = createDefaultData();
    await this.persist(this.data, true);
    return this;
  }

  async refresh() {
    await this.writeQueue;
    const rows = await this.request(this.endpoint("?id=eq.main&select=data&limit=1"), { method: "GET" });
    if (Array.isArray(rows) && rows[0] && rows[0].data) {
      this.data = normalizeLoadedData(rows[0].data);
    }
    return this;
  }

  read() {
    if (!this.data) throw new Error("SupabaseStore.init() must finish before reading data.");
    return clone(this.data);
  }

  readSections(fields) {
    if (!this.data) throw new Error("SupabaseStore.init() must finish before reading data.");
    if (!Array.isArray(fields)) throw new TypeError("SupabaseStore.readSections() expects an array.");
    const selected = {};
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(this.data, field)) selected[field] = this.data[field];
    }
    return clone(selected);
  }

  update(mutator) {
    const operation = this.writeQueue.catch(() => undefined).then(async () => {
      const draft = clone(this.data);
      const result = await mutator(draft);
      const normalized = normalizeLoadedData(draft);
      await this.persist(normalized, false);
      this.data = normalized;
      return clone(result);
    });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async flush() {
    await this.writeQueue;
  }

  async persist(data, insertIfMissing) {
    if (insertIfMissing) {
      await this.request(this.endpoint("?on_conflict=id"), {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{ id: "main", data, updated_at: new Date().toISOString() }]),
      });
      return;
    }
    await this.request(this.endpoint("?id=eq.main"), {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
    });
  }
}

module.exports = { SupabaseStore, databaseConfig };
