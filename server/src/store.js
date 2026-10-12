"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createDefaultData } = require("./defaults");
const { normalizePriceHistory } = require("./insights");

const LEGACY_DEMO_CATEGORY_IDS = new Set([
  "cat-amigurumis",
  "cat-bolsos",
  "cat-hogar",
  "cat-accesorios",
]);
const LEGACY_DEMO_PRODUCT_IDS = new Set([
  "prod-osito-canela",
  "prod-conejita-luna",
  "prod-bolso-terracota",
  "prod-tote-margaritas",
  "prod-sombrero-salvia",
  "prod-posavasos-flor",
  "prod-ballena-azul",
  "prod-ramito-eterno",
]);

const BUNDLED_PRICE_MIGRATION_V4 = new Map([
  ["prod-pulpi-fucsia", { previousPrice: 165, price: 110 }],
  ["prod-girasol-sol-de-miel", { previousPrice: 95, price: 90 }],
  ["prod-fresita-primavera", { previousPrice: 145, price: 105 }],
  ["prod-margarita-luz", { previousPrice: 105, price: 75 }],
  ["prod-mini-cactus-rosita", { previousPrice: 185, price: 85 }],
  ["prod-rosa-sol", { previousPrice: 110, price: 75 }],
  ["prod-osito-corazon", { previousPrice: 165, price: 95 }],
  ["prod-pollito-fresa", { previousPrice: 155, price: 120 }],
  ["prod-pulpi-cielo", { previousPrice: 175, price: 110 }],
  ["prod-pinguina-lavanda", { previousPrice: 150, price: 120 }],
  ["prod-pollito-primavera", { previousPrice: 165, price: 210 }],
  ["prod-conijelado-fresa", { previousPrice: 175, price: 120 }],
  ["prod-pinguinito-aqua", { previousPrice: 220, price: 120 }],
  ["prod-abejita-arcoiris", { previousPrice: 150, price: 195 }],
  ["prod-capi-aventurero", { previousPrice: 180, price: 130 }],
]);

function clone(value) {
  return structuredClone(value);
}

function hasExactIds(collection, expected) {
  return (
    Array.isArray(collection) &&
    collection.length === expected.size &&
    collection.every((entry) => entry && expected.has(entry.id))
  );
}

function catalogueEntriesAreUntouched(collection) {
  return collection.every(
    (entry) =>
      typeof entry.createdAt === "string" &&
      entry.createdAt.length > 0 &&
      entry.updatedAt === entry.createdAt,
  );
}

function hasLegacyDemoCatalogue(value) {
  return (
    Number(value.schemaVersion || 1) < 2 &&
    hasExactIds(value.categories, LEGACY_DEMO_CATEGORY_IDS) &&
    hasExactIds(value.products, LEGACY_DEMO_PRODUCT_IDS) &&
    catalogueEntriesAreUntouched(value.categories) &&
    catalogueEntriesAreUntouched(value.products)
  );
}

function migrateBundledCatalogueV4(products, previousSchemaVersion) {
  if (previousSchemaVersion >= 4) return products;

  return products.map((product) => {
    const migration = BUNDLED_PRICE_MIGRATION_V4.get(product && product.id);
    if (!migration || Number(product.price) !== migration.previousPrice) {
      return product;
    }

    const migrated = { ...product, price: migration.price };
    if (
      product.id === "prod-girasol-sol-de-miel" &&
      Array.isArray(product.sizes) &&
      product.sizes.length === 1 &&
      product.sizes[0] === "Mini"
    ) {
      migrated.sizes = ["Mediano · $90", "Grande · $105"];
    }
    return migrated;
  });
}

function normalizeLoadedData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The data store root must be a JSON object.");
  }

  const defaults = createDefaultData();
  if (!Array.isArray(value.categories) || !Array.isArray(value.products)) {
    throw new Error("The data store is missing catalogue collections.");
  }
  const replaceLegacyCatalogue = hasLegacyDemoCatalogue(value);
  const previousSchemaVersion = Number(value.schemaVersion || 1);
  const settings = {
    ...defaults.settings,
    ...(value.settings && typeof value.settings === "object"
      ? value.settings
      : {}),
  };
  if (
    previousSchemaVersion < 4 &&
    !String(settings.whatsappNumber || "").trim()
  ) {
    settings.whatsappNumber = defaults.settings.whatsappNumber;
  }
  const sourceProducts = replaceLegacyCatalogue
    ? defaults.products
    : value.products;

  return {
    schemaVersion: defaults.schemaVersion,
    settings,
    categories: replaceLegacyCatalogue ? defaults.categories : value.categories,
    products: migrateBundledCatalogueV4(
      sourceProducts,
      previousSchemaVersion,
    ),
    productPriceHistory: normalizePriceHistory(value.productPriceHistory),
    inquiries: Array.isArray(value.inquiries) ? value.inquiries : [],
    auth: {
      owner:
        value.auth && typeof value.auth === "object"
          ? value.auth.owner || null
          : null,
      sessions:
        value.auth && Array.isArray(value.auth.sessions)
          ? value.auth.sessions
          : [],
    },
  };
}

class JsonStore {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    this.filePath = path.join(this.dataDir, "store.json");
    this.data = null;
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fsp.mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    await fsp.chmod(this.dataDir, 0o700).catch(() => undefined);
    await this.#removeStaleTempFiles();

    try {
      const raw = await fsp.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.data = normalizeLoadedData(parsed);
      if (parsed.schemaVersion !== this.data.schemaVersion) {
        await this.#atomicWrite(this.data);
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        const reason =
          error instanceof SyntaxError
            ? "The JSON data store is corrupt and was not overwritten."
            : "Unable to open the JSON data store: " + error.message;
        throw new Error(reason, { cause: error });
      }

      this.data = createDefaultData();
      await this.#atomicWrite(this.data);
    }

    return this;
  }

  read() {
    if (!this.data) {
      throw new Error("JsonStore.init() must finish before reading data.");
    }
    return clone(this.data);
  }

  readSections(fields) {
    if (!this.data) {
      throw new Error("JsonStore.init() must finish before reading data.");
    }
    if (!Array.isArray(fields)) {
      throw new TypeError("JsonStore.readSections() expects an array.");
    }

    const selected = {};
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(this.data, field)) {
        selected[field] = this.data[field];
      }
    }
    return clone(selected);
  }

  update(mutator) {
    const operation = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        const draft = clone(this.data);
        const result = await mutator(draft);
        const normalized = normalizeLoadedData(draft);
        await this.#atomicWrite(normalized);
        this.data = normalized;
        return clone(result);
      });

    this.writeQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async flush() {
    await this.writeQueue;
  }

  async #atomicWrite(value) {
    const temporaryName =
      ".store-" + process.pid + "-" + randomUUID() + ".tmp";
    const temporaryPath = path.join(this.dataDir, temporaryName);
    const serialized = JSON.stringify(value, null, 2) + "\n";
    let handle;

    try {
      handle = await fsp.open(
        temporaryPath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
        0o600,
      );
      await handle.writeFile(serialized, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await fsp.rename(temporaryPath, this.filePath);
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => undefined);
      }
      await fsp.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }

    await fsp.chmod(this.filePath, 0o600).catch(() => undefined);

    let directory;
    try {
      directory = await fsp.open(this.dataDir, "r");
      await directory.sync();
    } catch (error) {
      // Directory fsync is not available on every platform/filesystem.
    } finally {
      if (directory) await directory.close().catch(() => undefined);
    }
  }

  async #removeStaleTempFiles() {
    const entries = await fsp.readdir(this.dataDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.startsWith(".store-") &&
            entry.name.endsWith(".tmp"),
        )
        .map((entry) =>
          fsp
            .unlink(path.join(this.dataDir, entry.name))
            .catch(() => undefined),
        ),
    );
  }
}

module.exports = {
  JsonStore,
  normalizeLoadedData,
};
