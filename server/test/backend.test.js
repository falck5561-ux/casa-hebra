"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { createDefaultData } = require("../src/defaults");
const { JsonStore } = require("../src/store");
const {
  hashPassword,
  isLoopbackAddress,
  isLoopbackRequest,
  rateLimit,
  safeSecretMatches,
  sameOrigin,
  verifyPassword,
} = require("../src/security");
const { pruneInquiryList } = require("../src/inquiries");
const {
  MAX_PRICE_HISTORY_RECORDS,
  appendPriceChange,
  buildAdminInsights,
  normalizePriceHistory,
} = require("../src/insights");
const {
  assertProductionOrigins,
  parsePort,
  resolveInquiryPolicy,
  resolveSetupPolicy,
  validatePublicOrigins,
} = require("../src/runtime-config");
const { buildWhatsappContact } = require("../src/whatsapp");
const {
  publicSettings,
  validateInquiry,
  validateProduct,
} = require("../src/validation");

let createApp;
let uploadTools;
let integrationSkip =
  process.env.CASA_HEBRA_TEST_MODE === "pure"
    ? "Excluded from the explicit pure test suite."
    : false;
if (!integrationSkip) {
  try {
    ({ createApp } = require("../src/app"));
    uploadTools = require("../src/uploads");
  } catch (error) {
    if (
      error.code === "MODULE_NOT_FOUND" &&
      /(?:express|multer)/.test(error.message)
    ) {
      integrationSkip =
        "Run npm install before integration tests (Express/Multer unavailable).";
    } else {
      throw error;
    }
  }
}

if (!uploadTools) {
  const originalLoad = Module._load;
  function multerStub() {
    return { array: () => () => undefined };
  }
  multerStub.memoryStorage = () => ({});
  multerStub.MulterError = class MulterError extends Error {};
  Module._load = function load(request, parent, isMain) {
    if (request === "multer") return multerStub;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    uploadTools = require("../src/uploads");
  } finally {
    Module._load = originalLoad;
  }
}

test("passwords use salted scrypt and verify safely", async () => {
  const password = "CasaHebra2026!";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^scrypt\$/);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("incorrecta123", first), false);
});

test("first-run production configuration is explicit and secrets compare safely", () => {
  assert.throws(
    () =>
      resolveSetupPolicy({
        production: true,
        hasOwner: false,
        setupToken: undefined,
      }),
    /SETUP_TOKEN/,
  );
  assert.throws(
    () =>
      resolveSetupPolicy({
        production: false,
        hasOwner: false,
        setupToken: "demasiado-corto",
      }),
    /16 to 512/,
  );
  const policy = resolveSetupPolicy({
    production: true,
    hasOwner: false,
    setupToken: "uBj4zpM8YyKjJxw6mX8rEpnG",
  });
  assert.equal(policy.tokenConfigured, true);
  assert.equal(
    safeSecretMatches(policy.setupToken, "uBj4zpM8YyKjJxw6mX8rEpnG"),
    true,
  );
  assert.equal(safeSecretMatches(policy.setupToken, "otro-token-seguro-123"), false);

  assert.throws(() => assertProductionOrigins(true, []), /PUBLIC_ORIGIN/);
  assert.throws(
    () => validatePublicOrigins("http://tienda.example", { production: true }),
    /HTTPS/,
  );
  assert.deepEqual(
    validatePublicOrigins("https://tienda.example,https://tienda.example", {
      production: true,
    }),
    ["https://tienda.example"],
  );
  assert.equal(isLoopbackAddress("127.0.0.25"), true);
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress("192.168.1.20"), false);
  const requestFrom = (host, origin) => ({
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    get(name) {
      if (name === "host") return host;
      if (name === "origin") return origin;
      return undefined;
    },
  });
  assert.equal(
    isLoopbackRequest(requestFrom("localhost:8787", "http://localhost:5173")),
    true,
  );
  assert.equal(
    isLoopbackRequest(
      requestFrom("192.168.1.10:5173", "http://192.168.1.10:5173"),
    ),
    false,
  );
  assert.equal(
    isLoopbackRequest(
      requestFrom("localhost:8787", "http://192.168.1.10:5173"),
    ),
    false,
  );
  assert.equal(parsePort("8787"), 8787);
  assert.throws(() => parsePort("8787junk"), /digits only/);
  assert.throws(() => parsePort("65536"), /between 1 and 65535/);
});

test("product images allow only bundled assets and UUID-backed local uploads", () => {
  const bundledProductImage = createDefaultData().products[0].images[0];
  const base = {
    name: "Pieza segura",
    price: 250,
    categoryId: "category-1",
    stockQuantity: 1,
  };
  const uuidUpload =
    "/uploads/123e4567-e89b-42d3-a456-426614174000.webp";
  assert.deepEqual(
    validateProduct({
      ...base,
      images: [
        "/demo/oso-canela.svg",
        bundledProductImage,
        "/demo/tote-margaritas.svg",
        "/demo/flores-de-mesa.svg",
        uuidUpload,
      ],
    })
      .images,
    [
      "/demo/oso-canela.svg",
      bundledProductImage,
      "/demo/tote-margaritas.svg",
      "/demo/flores-de-mesa.svg",
      uuidUpload,
    ],
  );
  for (const image of [
    "https://tracker.example/pixel.png",
    "/demo/og-casa-hebra.svg",
    "/products/no-existe.png",
    "/uploads/not-a-uuid.png",
    "/uploads/123e4567-e89b-02d3-a456-426614174000.png",
  ]) {
    assert.throws(
      () => validateProduct({ ...base, images: [image] }),
      (error) => error.status === 400 && error.details.field === "images[0]",
    );
  }
  assert.throws(
    () =>
      validateProduct({
        ...base,
        images: Array.from({ length: 6 }, () => "/demo/oso-canela.svg"),
      }),
    (error) => error.status === 400 && error.details.field === "images",
  );
  assert.throws(
    () => validateProduct({ ...base, status: "available", stockQuantity: 0 }),
    (error) =>
      error.status === 400 && error.details.field === "stockQuantity",
  );
});

test("the bundled catalogue has 20 valid products with safe image routes", async () => {
  const data = createDefaultData("2026-09-14T00:00:00.000Z");
  const publicDirectory = path.resolve(__dirname, "../../client/public");
  const categoryIds = new Set(data.categories.map((category) => category.id));
  const productIds = new Set(data.products.map((product) => product.id));
  const productSlugs = new Set(data.products.map((product) => product.slug));
  const imageRoutes = data.products.flatMap((product) => product.images);
  const expectedPrices = new Map([
    ["prod-pulpi-fucsia", 110],
    ["prod-girasol-sol-de-miel", 90],
    ["prod-fresita-primavera", 105],
    ["prod-margarita-luz", 75],
    ["prod-mini-cactus-rosita", 85],
    ["prod-rosa-sol", 75],
    ["prod-osito-corazon", 95],
    ["prod-pollito-fresa", 120],
    ["prod-pulpi-cielo", 110],
    ["prod-pinguina-lavanda", 120],
    ["prod-pollito-primavera", 210],
    ["prod-conijelado-fresa", 120],
    ["prod-michi-turquesa", 195],
    ["prod-besito-perruno", 360],
    ["prod-cerdito-bombon", 185],
    ["prod-tortuguita-rosita", 210],
    ["prod-violeta-en-flor", 225],
    ["prod-pinguinito-aqua", 120],
    ["prod-abejita-arcoiris", 195],
    ["prod-capi-aventurero", 130],
  ]);

  assert.equal(data.schemaVersion, 4);
  assert.equal(data.settings.whatsappNumber, "+5219811681460");
  assert.deepEqual(data.productPriceHistory, []);
  assert.equal(data.categories.length, 4);
  assert.equal(categoryIds.size, 4);
  assert.equal(data.products.length, 20);
  assert.equal(productIds.size, 20);
  assert.equal(productSlugs.size, 20);
  assert.equal(imageRoutes.length, 20);
  assert.equal(new Set(imageRoutes).size, 20);

  for (const product of data.products) {
    assert.equal(product.price, expectedPrices.get(product.id));
    assert.equal(categoryIds.has(product.categoryId), true);
    assert.equal(product.status, "made_to_order");
    assert.equal(product.stockQuantity, 0);
    assert.equal(product.images.length, 1);
    assert.match(
      product.images[0],
      /^\/products\/[a-z0-9-]+\.(?:png|webp)$/,
    );
    assert.deepEqual(validateProduct(product).images, product.images);
    const bundledFile = path.resolve(
      publicDirectory,
      product.images[0].slice(1),
    );
    assert.equal(bundledFile.startsWith(publicDirectory + path.sep), true);
    assert.equal((await fs.stat(bundledFile)).isFile(), true);
  }
});

test("inquiry retention removes expired records and enforces a newest-first cap", () => {
  const now = Date.parse("2026-09-12T12:00:00.000Z");
  const policy = resolveInquiryPolicy({ retentionDays: 180, maxInquiries: 2 });
  const records = [
    { id: "expired", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "older", createdAt: "2026-09-11T00:00:00.000Z" },
    { id: "same-time-first", createdAt: "2026-09-12T00:00:00.000Z" },
    { id: "same-time-newest", createdAt: "2026-09-12T00:00:00.000Z" },
  ];
  assert.deepEqual(
    pruneInquiryList(records, policy, now).map((record) => record.id),
    ["same-time-newest", "same-time-first"],
  );
  assert.throws(
    () => resolveInquiryPolicy({ retentionDays: "forever" }),
    /INQUIRY_RETENTION_DAYS/,
  );
  assert.throws(
    () => resolveInquiryPolicy({ retentionDays: 181 }),
    /between 1 and 180/,
  );
  assert.throws(
    () => resolveInquiryPolicy({ maxInquiries: 5_001 }),
    /between 1 and 5000/,
  );
});

test("price history is bounded, normalized and records only real changes", () => {
  const unchanged = appendPriceChange([], {
    productId: "prod-1",
    productName: "Osito",
    previousPrice: 125,
    newPrice: 125,
    currency: "MXN",
    changedAt: "2026-09-20T12:00:00.000Z",
  });
  assert.deepEqual(unchanged, []);

  let history = [];
  for (let index = 0; index < MAX_PRICE_HISTORY_RECORDS + 5; index += 1) {
    history = appendPriceChange(history, {
      productId: "prod-1",
      productName: "Osito",
      previousPrice: index,
      newPrice: index + 1,
      currency: "MXN",
      changedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    });
  }
  assert.equal(history.length, MAX_PRICE_HISTORY_RECORDS);
  assert.equal(history[0].previousPrice, 5);
  assert.equal(history.at(-1).newPrice, MAX_PRICE_HISTORY_RECORDS + 5);

  assert.deepEqual(
    normalizePriceHistory([
      ...history.slice(-1),
      { id: "invalid", productId: "prod-1", previousPrice: "gratis" },
    ]),
    history.slice(-1),
  );
});

test("admin insights aggregate existing inquiries without customer data", () => {
  const insights = buildAdminInsights(
    [
      { id: "prod-1", name: "Osito" },
      { id: "prod-2", name: "Flor" },
    ],
    [
      {
        customerName: "Dato privado que no debe salir",
        createdAt: "2026-09-20T12:00:00.000Z",
        items: [
          { productId: "prod-1", quantity: 1 },
          { productId: "prod-1", quantity: 2 },
        ],
      },
      {
        createdAt: "2026-09-21T12:00:00.000Z",
        items: [
          { productId: "prod-1", quantity: 1 },
          { productId: "prod-2", quantity: 2 },
        ],
      },
      { createdAt: "2026-09-21T13:00:00.000Z", items: [] },
      {
        createdAt: "2026-09-21T14:00:00.000Z",
        note: "Personalización guiada · Color solicitado: verde",
        items: [{ productId: "prod-2", quantity: 1 }],
      },
    ],
  );

  assert.equal(insights.totalInquiries, 4);
  assert.equal(insights.catalogueInquiries, 2);
  assert.equal(insights.customInquiries, 2);
  assert.equal(insights.totalRequestedUnits, 7);
  assert.deepEqual(insights.productConsultations[0], {
    productId: "prod-1",
    productName: "Osito",
    inquiryCount: 2,
    unitsRequested: 4,
    lastConsultedAt: "2026-09-21T12:00:00.000Z",
  });
  assert.equal(
    JSON.stringify(insights).includes("Dato privado que no debe salir"),
    false,
  );
});

test("canonical WhatsApp contact uses server snapshots and a valid wa.me URL", () => {
  const inquiry = {
    customerName: "Ana",
    note: "En tonos cálidos",
    currency: "MXN",
    estimatedTotal: 246.9,
    items: [
      {
        productName: "Flor del servidor",
        quantity: 2,
        color: "Terracota",
        size: "Única",
        lineTotal: 246.9,
      },
    ],
  };
  const contact = buildWhatsappContact(
    {
      storeName: "Casa Hebra",
      whatsappNumber: "+529811234567",
      currency: "USD",
    },
    inquiry,
  );
  assert.match(contact.whatsappUrl, /^https:\/\/wa\.me\/529811234567\?text=/);
  assert.match(contact.whatsappMessage, /Flor del servidor/);
  assert.match(contact.whatsappMessage, /\$246\.9/);
  assert.equal(contact.whatsappMessage.includes("USD"), false);
  assert.equal(
    decodeURIComponent(contact.whatsappUrl.split("?text=")[1]),
    contact.whatsappMessage,
  );

  const custom = buildWhatsappContact(
    {
      storeName: "Casa Hebra",
      whatsappNumber: "+529811234567",
      currency: "MXN",
    },
    {
      customerName: "Luz",
      note: "Un dragón pequeño de color verde",
      currency: "MXN",
      estimatedTotal: 0,
      items: [],
    },
  );
  assert.match(custom.whatsappMessage, /Detalles: Un dragón pequeño/);

  const guided = buildWhatsappContact(
    {
      storeName: "Casa Hebra",
      whatsappNumber: "+529811234567",
      currency: "MXN",
    },
    {
      customerName: "Sol",
      note: "Personalización guiada · Tamaño solicitado: 20 cm",
      currency: "MXN",
      estimatedTotal: 165,
      items: [{
        productName: "Osito Corazón",
        quantity: 1,
        color: "Color a elegir",
        size: "Mini",
        lineTotal: 165,
      }],
    },
  );
  assert.match(guided.whatsappMessage, /Quisiera personalizar esta pieza base/);
  assert.match(guided.whatsappMessage, /Tamaño base: Mini/);
  assert.match(guided.whatsappMessage, /Tamaño solicitado: 20 cm/);
  assert.match(guided.whatsappMessage, /Estimado base:/);

  assert.throws(
    () =>
      buildWhatsappContact(
        { storeName: "Casa Hebra", whatsappNumber: "+529811234567" },
        {
          customerName: "Ana",
          currency: "MXN",
          note: "ñ".repeat(1_200),
          estimatedTotal: 20,
          items: Array.from({ length: 20 }, (_, index) => ({
            productName: `Pieza ${index + 1} ${"á".repeat(90)}`,
            quantity: 1,
            color: "ó".repeat(60),
            size: "ú".repeat(60),
            lineTotal: 1,
          })),
        },
      ),
    (error) =>
      error.status === 422 && error.code === "WHATSAPP_MESSAGE_TOO_LONG",
  );
});

test("JSON persistence serializes concurrent mutations", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "casa-hebra-store-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await new JsonStore(directory).init();

  await Promise.all(
    Array.from({ length: 30 }, (_, index) =>
      store.update((draft) => {
        draft.inquiries.push({
          id: "concurrent-" + index,
          customerName: "Prueba",
          items: [],
          note: "Consulta",
          estimatedTotal: 0,
          status: "whatsapp_opened",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }),
    ),
  );
  const disk = JSON.parse(
    await fs.readFile(path.join(directory, "store.json"), "utf8"),
  );
  assert.equal(disk.inquiries.length, 30);
  assert.equal(new Set(disk.inquiries.map((entry) => entry.id)).size, 30);
  const catalogue = store.readSections(["settings", "products"]);
  assert.deepEqual(Object.keys(catalogue).sort(), ["products", "settings"]);
  catalogue.products.length = 0;
  assert.equal(store.readSections(["products"]).products.length, 20);
});

test("fresh stores include the Casa Hebra WhatsApp without replacing saved settings", async (t) => {
  const freshDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "casa-hebra-whatsapp-default-"),
  );
  t.after(() => fs.rm(freshDirectory, { recursive: true, force: true }));

  const freshStore = await new JsonStore(freshDirectory).init();
  const freshData = freshStore.read();
  assert.equal(freshData.settings.whatsappNumber, "+5219811681460");
  const defaultContact = buildWhatsappContact(freshData.settings, {
    customerName: "Ana",
    currency: "MXN",
    note: "",
    estimatedTotal: 110,
    items: [
      {
        productName: "Pulpi Fucsia Personalizado",
        quantity: 1,
        color: "Fucsia",
        size: "Mini",
        lineTotal: 110,
      },
    ],
  });
  assert.match(
    defaultContact.whatsappUrl,
    /^https:\/\/wa\.me\/5219811681460\?text=/,
  );

  const savedDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "casa-hebra-whatsapp-saved-"),
  );
  t.after(() => fs.rm(savedDirectory, { recursive: true, force: true }));
  const saved = createDefaultData("2026-09-10T00:00:00.000Z");
  saved.schemaVersion = 3;
  saved.settings.whatsappNumber = "+529811234567";
  await fs.writeFile(
    path.join(savedDirectory, "store.json"),
    JSON.stringify(saved),
    "utf8",
  );

  const savedStore = await new JsonStore(savedDirectory).init();
  assert.equal(savedStore.read().schemaVersion, 4);
  assert.equal(savedStore.read().settings.whatsappNumber, "+529811234567");
});

test("the legacy demo catalogue upgrades without losing owner settings", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "casa-hebra-migration-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const legacy = {
    schemaVersion: 1,
    settings: {
      storeName: "Mi Casa Hebra",
      whatsappNumber: "529811234567",
      accentColor: "#7A3E62",
    },
    categories: [
      "cat-amigurumis",
      "cat-bolsos",
      "cat-hogar",
      "cat-accesorios",
    ].map((id) => ({
      id,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    })),
    products: [
      "prod-osito-canela",
      "prod-conejita-luna",
      "prod-bolso-terracota",
      "prod-tote-margaritas",
      "prod-sombrero-salvia",
      "prod-posavasos-flor",
      "prod-ballena-azul",
      "prod-ramito-eterno",
    ].map((id) => ({
      id,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    })),
    inquiries: [{ id: "consulta-existente" }],
    auth: {
      owner: { id: "owner-existente", email: "duena@example.com" },
      sessions: [
        {
          tokenHash: "sesion-existente",
          expiresAt: "2026-09-15T00:00:00.000Z",
        },
      ],
    },
  };
  await fs.writeFile(
    path.join(directory, "store.json"),
    JSON.stringify(legacy),
    "utf8",
  );

  const store = await new JsonStore(directory).init();
  const migrated = store.read();
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.settings.storeName, "Mi Casa Hebra");
  assert.equal(migrated.settings.whatsappNumber, "529811234567");
  assert.equal(migrated.settings.accentColor, "#7A3E62");
  assert.equal(migrated.products.length, 20);
  assert.equal(migrated.categories[0].id, "cat-llaveros");
  assert.deepEqual(migrated.inquiries, legacy.inquiries);
  assert.deepEqual(migrated.productPriceHistory, []);
  assert.deepEqual(migrated.auth, legacy.auth);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(directory, "store.json"), "utf8"))
      .schemaVersion,
    4,
  );

  const customizedDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "casa-hebra-custom-catalogue-"),
  );
  t.after(() => fs.rm(customizedDirectory, { recursive: true, force: true }));
  const customized = structuredClone(legacy);
  customized.products[0].name = "Nombre personalizado por la dueña";
  customized.products[0].updatedAt = "2026-09-02T00:00:00.000Z";
  await fs.writeFile(
    path.join(customizedDirectory, "store.json"),
    JSON.stringify(customized),
    "utf8",
  );
  const preserved = await new JsonStore(customizedDirectory).init();
  assert.equal(preserved.read().schemaVersion, 4);
  assert.equal(preserved.read().products.length, 8);
  assert.equal(
    preserved.read().products[0].name,
    "Nombre personalizado por la dueña",
  );
});

test("schema two upgrades preserve catalogue data and valid price history", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "casa-hebra-price-history-migration-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const previous = createDefaultData("2026-09-20T00:00:00.000Z");
  previous.schemaVersion = 2;
  previous.products[0].name = "Nombre conservado";
  previous.productPriceHistory = [
    {
      id: "price-change-1",
      productId: previous.products[0].id,
      productName: previous.products[0].name,
      previousPrice: 150,
      newPrice: 165,
      currency: "MXN",
      changedAt: "2026-09-20T12:00:00.000Z",
    },
  ];
  await fs.writeFile(
    path.join(directory, "store.json"),
    JSON.stringify(previous),
    "utf8",
  );

  const migratedStore = await new JsonStore(directory).init();
  const migrated = migratedStore.read();
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.products[0].name, "Nombre conservado");
  assert.deepEqual(migrated.productPriceHistory, previous.productPriceHistory);
});

test("schema three migrates only unchanged bundled prices and fills an empty WhatsApp", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "casa-hebra-real-prices-migration-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const previous = createDefaultData("2026-09-22T00:00:00.000Z");
  previous.schemaVersion = 3;
  previous.settings.whatsappNumber = "";
  const oldBundledPrices = new Map([
    ["prod-pulpi-fucsia", 165],
    ["prod-girasol-sol-de-miel", 95],
    ["prod-fresita-primavera", 145],
    ["prod-margarita-luz", 105],
    ["prod-mini-cactus-rosita", 185],
    ["prod-rosa-sol", 110],
    ["prod-osito-corazon", 165],
    ["prod-pollito-fresa", 155],
    ["prod-pulpi-cielo", 175],
    ["prod-pinguina-lavanda", 150],
    ["prod-pollito-primavera", 165],
    ["prod-conijelado-fresa", 175],
    ["prod-pinguinito-aqua", 220],
    ["prod-abejita-arcoiris", 150],
    ["prod-capi-aventurero", 180],
  ]);
  for (const product of previous.products) {
    if (oldBundledPrices.has(product.id)) {
      product.price = oldBundledPrices.get(product.id);
    }
  }
  const girasol = previous.products.find(
    (product) => product.id === "prod-girasol-sol-de-miel",
  );
  girasol.sizes = ["Mini"];
  const customProduct = previous.products.find(
    (product) => product.id === "prod-pulpi-cielo",
  );
  customProduct.name = "Pulpi Cielo con nombre conservado";
  customProduct.price = 444;

  await fs.writeFile(
    path.join(directory, "store.json"),
    JSON.stringify(previous),
    "utf8",
  );

  const migratedStore = await new JsonStore(directory).init();
  const migrated = migratedStore.read();
  const productById = new Map(
    migrated.products.map((product) => [product.id, product]),
  );

  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.settings.whatsappNumber, "+5219811681460");
  assert.equal(productById.get("prod-pulpi-fucsia").price, 110);
  assert.equal(productById.get("prod-girasol-sol-de-miel").price, 90);
  assert.deepEqual(productById.get("prod-girasol-sol-de-miel").sizes, [
    "Mediano · $90",
    "Grande · $105",
  ]);
  assert.equal(productById.get("prod-pollito-primavera").price, 210);
  assert.equal(productById.get("prod-capi-aventurero").price, 130);
  assert.equal(productById.get("prod-pulpi-cielo").price, 444);
  assert.equal(
    productById.get("prod-pulpi-cielo").name,
    "Pulpi Cielo con nombre conservado",
  );
  assert.equal(productById.get("prod-michi-turquesa").price, 195);
  assert.equal(productById.get("prod-besito-perruno").price, 360);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(directory, "store.json"), "utf8"))
      .schemaVersion,
    4,
  );
});

test("private address fields are rejected from settings", () => {
  assert.throws(
    () =>
      publicSettings(
        { homeAddress: "Calle privada 123" },
        { storeName: "Casa Hebra" },
      ),
    (error) =>
      error.status === 400 && error.code === "PRIVATE_ADDRESS_NOT_ALLOWED",
  );
  assert.throws(
    () =>
      publicSettings(
        { pickupLabel: "Recogida en Calle Privada 123, casa azul" },
        { storeName: "Casa Hebra" },
      ),
    (error) =>
      error.status === 400 && error.code === "PRIVATE_ADDRESS_NOT_ALLOWED",
  );
  for (const pickupLabel of [
    "Recogida en Privada Jacarandas, portón azul",
    "Consulta el punto en https://waze.com/ul/example",
    "Recogida en zona 12",
  ]) {
    assert.throws(
      () =>
        publicSettings(
          { pickupLabel },
          { storeName: "Casa Hebra" },
        ),
      (error) =>
        error.status === 400 && error.code === "PRIVATE_ADDRESS_NOT_ALLOWED",
    );
  }
  assert.throws(
    () =>
      publicSettings(
        { city: "Campeche 24000" },
        { storeName: "Casa Hebra" },
      ),
    (error) =>
      error.status === 400 && error.details.field === "city",
  );
});

test("inquiry totals and item snapshots come from the catalogue", () => {
  const products = [
    {
      id: "prod-1",
      name: "Osito",
      slug: "osito",
      price: 125.5,
      active: true,
      status: "available",
      stockQuantity: 4,
      colors: ["Canela"],
      sizes: ["20 cm"],
      images: ["/demo/oso-canela.svg"],
    },
  ];
  const result = validateInquiry(
    {
      customerName: "Ana",
      privacyAccepted: true,
      estimatedTotal: 1,
      items: [
        {
          productId: "prod-1",
          quantity: 2,
          color: "Canela",
          size: "20 cm",
          unitPrice: 1,
        },
      ],
    },
    products,
  );
  assert.equal(result.estimatedTotal, 251);
  assert.equal(result.items[0].unitPrice, 125.5);
  assert.equal(result.items[0].productName, "Osito");

  const pricedSizeResult = validateInquiry(
    {
      customerName: "Ana",
      privacyAccepted: true,
      items: [
        {
          productId: "prod-girasol",
          quantity: 2,
          size: "Grande · $105",
        },
      ],
    },
    [
      {
        id: "prod-girasol",
        name: "Girasol Sol de Miel",
        slug: "girasol-sol-de-miel",
        price: 90,
        active: true,
        status: "made_to_order",
        stockQuantity: 0,
        colors: [],
        sizes: ["Mediano · $90", "Grande · $105"],
        images: ["/products/girasol-sol-de-miel.webp"],
      },
    ],
  );
  assert.equal(pricedSizeResult.items[0].unitPrice, 105);
  assert.equal(pricedSizeResult.items[0].lineTotal, 210);
  assert.equal(pricedSizeResult.estimatedTotal, 210);

  assert.throws(
    () =>
      validateInquiry(
        {
          customerName: "Ana",
          privacyAccepted: true,
          items: [{ productId: "prod-1", quantity: 1, size: "20 cm" }],
        },
        products,
      ),
    (error) =>
      error.status === 400 && error.details.field === "items[0].color",
  );
  assert.throws(
    () =>
      validateInquiry(
        {
          customerName: "Ana",
          privacyAccepted: true,
          items: [
            { productId: "prod-1", quantity: 1, color: "Canela" },
          ],
        },
        products,
      ),
    (error) =>
      error.status === 400 && error.details.field === "items[0].size",
  );
  assert.throws(
    () =>
      validateInquiry(
        {
          customerName: "Ana",
          items: [
            {
              productId: "prod-1",
              quantity: 1,
              color: "Canela",
              size: "20 cm",
            },
          ],
        },
        products,
      ),
    (error) =>
      error.status === 400 && error.details.field === "privacyAccepted",
  );
});

test("malformed Unicode text is rejected before composing WhatsApp", () => {
  assert.throws(
    () =>
      validateInquiry(
        {
          customerName: "Ana",
          privacyAccepted: true,
          note: "\ud800\ud800\ud800",
          items: [],
        },
        [],
        [],
      ),
    (error) =>
      error.status === 400 && error.details.field === "note",
  );
});

test("inquiries aggregate stock and honor hidden categories", () => {
  const product = {
    id: "prod-1",
    name: "Osito",
    slug: "osito",
    categoryId: "cat-hidden",
    price: 100,
    active: true,
    status: "available",
    stockQuantity: 3,
    colors: ["Canela", "Crema"],
    sizes: [],
    images: [],
  };
  assert.throws(
    () =>
      validateInquiry(
        {
          customerName: "Ana",
          privacyAccepted: true,
          items: [
            { productId: "prod-1", quantity: 2, color: "Canela" },
            { productId: "prod-1", quantity: 2, color: "Crema" },
          ],
        },
        [product],
      ),
    (error) => error.status === 400 && error.details.field === "items",
  );
  assert.throws(
    () =>
      validateInquiry(
        {
          customerName: "Ana",
          privacyAccepted: true,
          items: [
            { productId: "prod-1", quantity: 1, color: "Canela" },
          ],
        },
        [product],
        [{ id: "cat-hidden", active: false }],
      ),
    (error) => error.status === 400,
  );
});

test("strict origin verification and per-client rate limits behave safely", () => {
  const middleware = sameOrigin({
    allowedOrigins: ["https://casa.example"],
    requireOrigin: true,
    allowInferredOrigin: false,
  });
  let originError;
  middleware(
    {
      method: "POST",
      protocol: "https",
      get: () => undefined,
    },
    {},
    (error) => {
      originError = error;
    },
  );
  assert.equal(originError.code, "ORIGIN_REQUIRED");

  const limiter = rateLimit({ limit: 1, windowMs: 60_000, keyPrefix: "test" });
  const response = () => ({ setHeader() {} });
  const outcomes = [];
  for (const ip of ["198.51.100.1", "198.51.100.2"]) {
    limiter(
      { ip, socket: { remoteAddress: "127.0.0.1" } },
      response(),
      (error) => outcomes.push(error || null),
    );
  }
  assert.deepEqual(outcomes, [null, null]);

  const globalLimiter = rateLimit({
    limit: 1,
    windowMs: 60_000,
    keyPrefix: "global-test",
    keyGenerator: () => "store",
  });
  const globalOutcomes = [];
  for (const ip of ["198.51.100.1", "198.51.100.2"]) {
    globalLimiter(
      { ip, socket: { remoteAddress: ip } },
      response(),
      (error) => globalOutcomes.push(error || null),
    );
  }
  assert.equal(globalOutcomes[0], null);
  assert.equal(globalOutcomes[1].code, "RATE_LIMITED");
});

test(
  "metadata stripping removes textual PNG metadata",
  () => {
    const base = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const iendOffset = base.length - 12;
    const payload = Buffer.from("GPS=19.8301,-90.5349");
    const textChunk = Buffer.alloc(12 + payload.length);
    textChunk.writeUInt32BE(payload.length, 0);
    textChunk.write("tEXt", 4, "ascii");
    payload.copy(textChunk, 8);
    let crc = 0xffffffff;
    for (const byte of textChunk.subarray(4, 8 + payload.length)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    textChunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + payload.length);
    const withMetadata = Buffer.concat([
      base.subarray(0, iendOffset),
      textChunk,
      base.subarray(iendOffset),
    ]);
    const cleaned = uploadTools.stripImageMetadata(withMetadata, {
      mime: "image/png",
    });
    assert.equal(cleaned.includes(Buffer.from("GPS=")), false);
    assert.equal(
      cleaned.toString("ascii", cleaned.length - 8, cleaned.length - 4),
      "IEND",
    );
  },
);

test("malformed raster skeletons are rejected", () => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const fakeHeader = Buffer.alloc(25);
  fakeHeader.writeUInt32BE(13, 0);
  fakeHeader.write("IHDR", 4, "ascii");
  fakeHeader.writeUInt32BE(1, 8);
  fakeHeader.writeUInt32BE(1, 12);
  fakeHeader[16] = 8;
  fakeHeader[17] = 6;
  const pngEnd = Buffer.from([
    0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ]);
  const fakePng = Buffer.concat([signature, fakeHeader, pngEnd]);

  const fakeWebp = Buffer.alloc(30);
  fakeWebp.write("RIFF", 0, "ascii");
  fakeWebp.writeUInt32LE(22, 4);
  fakeWebp.write("WEBP", 8, "ascii");
  fakeWebp.write("VP8X", 12, "ascii");
  fakeWebp.writeUInt32LE(10, 16);

  const fakeJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01,
    0x00, 0x00, 0xff, 0xd9,
  ]);

  for (const [mimetype, buffer] of [
    ["image/png", fakePng],
    ["image/webp", fakeWebp],
    ["image/jpeg", fakeJpeg],
  ]) {
    assert.throws(
      () => uploadTools.inspectImage({ mimetype, buffer }, 0),
      (error) => error.status >= 400,
    );
  }
});

test("orphan upload cleanup preserves referenced files", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "casa-hebra-media-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const orphan =
    "11111111-1111-4111-8111-111111111111.png";
  const referenced =
    "22222222-2222-4222-8222-222222222222.png";
  await fs.writeFile(path.join(directory, orphan), "orphan");
  await fs.writeFile(path.join(directory, referenced), "kept");
  const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await fs.utimes(path.join(directory, orphan), old, old);
  await fs.utimes(path.join(directory, referenced), old, old);

  const removed = await uploadTools.cleanupOrphanUploads(directory, {
    products: [{ images: ["/uploads/" + referenced] }],
    inquiries: [],
  });
  assert.equal(removed, 1);
  await assert.rejects(fs.stat(path.join(directory, orphan)), { code: "ENOENT" });
  assert.equal((await fs.stat(path.join(directory, referenced))).isFile(), true);
});

test(
  "production first-run requires origin and a non-persisted setup token",
  { skip: integrationSkip },
  async (t) => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "casa-hebra-production-"),
    );
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const setupToken = "uBj4zpM8YyKjJxw6mX8rEpnG";
    const publicOrigin = "https://catalogo.example";

    await assert.rejects(
      createApp({
        production: true,
        dataDir: directory,
        clientDist: path.join(directory, "missing-client"),
        setupToken,
        allowedOrigins: [],
      }),
      /PUBLIC_ORIGIN/,
    );
    await assert.rejects(
      createApp({
        production: true,
        dataDir: directory,
        clientDist: path.join(directory, "missing-client"),
        allowedOrigins: [publicOrigin],
      }),
      /SETUP_TOKEN/,
    );

    const { app } = await createApp({
      production: true,
      dataDir: directory,
      clientDist: path.join(directory, "missing-client"),
      setupToken,
      allowedOrigins: [publicOrigin],
      authRateLimit: 50,
    });
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const baseUrl = "http://127.0.0.1:" + server.address().port;

    const status = await fetch(baseUrl + "/api/auth/status");
    assert.equal(
      status.headers.get("strict-transport-security"),
      "max-age=31536000",
    );
    assert.deepEqual(await status.json(), {
      authenticated: false,
      needsSetup: true,
      setupRequiresToken: true,
      user: null,
    });

    const wrong = await fetch(baseUrl + "/api/auth/setup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: publicOrigin,
      },
      body: JSON.stringify({
        email: "dueña@example.com",
        password: "HebraSegura2026!",
        setupToken: "token-equivocado-seguro",
      }),
    });
    assert.equal(wrong.status, 403);

    const setup = await fetch(baseUrl + "/api/auth/setup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: publicOrigin,
      },
      body: JSON.stringify({
        email: "dueña@example.com",
        password: "HebraSegura2026!",
        setupToken,
      }),
    });
    assert.equal(setup.status, 201);
    assert.match(setup.headers.get("set-cookie"), /; Secure/);
    const storedText = await fs.readFile(
      path.join(directory, "store.json"),
      "utf8",
    );
    assert.equal(storedText.includes(setupToken), false);

    await assert.rejects(
      createApp({
        production: true,
        dataDir: directory,
        clientDist: path.join(directory, "missing-client"),
        allowedOrigins: [],
      }),
      /PUBLIC_ORIGIN/,
    );
    const restarted = await createApp({
      production: true,
      dataDir: directory,
      clientDist: path.join(directory, "missing-client"),
      allowedOrigins: [publicOrigin],
    });
    assert.equal(Boolean(restarted.store.read().auth.owner), true);
  },
);

test(
  "public and admin API flow persists a safe inquiry",
  { skip: integrationSkip },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "casa-hebra-api-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const { app } = await createApp({
      dataDir: directory,
      clientDist: path.join(directory, "missing-client"),
      authRateLimit: 50,
      inquiryRateLimit: 50,
    });
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const address = server.address();
    const origin = "http://127.0.0.1:" + address.port;

    async function request(route, options = {}) {
      const headers = { ...(options.headers || {}) };
      if (options.body && !(options.body instanceof FormData)) {
        headers["content-type"] = "application/json";
      }
      if (options.method && options.method !== "GET") {
        headers.origin = options.origin || origin;
      }
      return fetch(origin + route, {
        ...options,
        headers,
        body:
          options.body && !(options.body instanceof FormData)
            ? JSON.stringify(options.body)
            : options.body,
      });
    }

    const initialStatus = await request("/api/auth/status");
    assert.deepEqual(await initialStatus.json(), {
      authenticated: false,
      needsSetup: true,
      setupRequiresToken: false,
      user: null,
    });

    const setup = await request("/api/auth/setup", {
      method: "POST",
      body: { email: "dueña@example.com", password: "HebraSegura2026!" },
    });
    assert.equal(setup.status, 201);
    const cookie = setup.headers.get("set-cookie").split(";")[0];
    assert.match(setup.headers.get("set-cookie"), /HttpOnly/);
    assert.match(setup.headers.get("set-cookie"), /SameSite=Lax/);

    const defaultCatalogue = await request("/api/store");
    assert.equal(defaultCatalogue.status, 200);
    assert.equal(
      (await defaultCatalogue.json()).settings.whatsappNumber,
      "+5219811681460",
    );

    const clearedSettings = await request("/api/admin/settings", {
      method: "PUT",
      headers: { cookie },
      body: { whatsappNumber: "" },
    });
    assert.equal(clearedSettings.status, 200);

    const missingWhatsapp = await request("/api/inquiries", {
      method: "POST",
      body: {
        customerName: "Ana",
        privacyAccepted: true,
        note: "Consulta antes de configurar WhatsApp",
        items: [],
      },
    });
    assert.equal(missingWhatsapp.status, 503);
    assert.equal(missingWhatsapp.headers.get("cache-control"), "no-store");
    assert.equal((await missingWhatsapp.json()).code, "WHATSAPP_NOT_CONFIGURED");

    const configuredSettings = await request("/api/admin/settings", {
      method: "PUT",
      headers: { cookie },
      body: { whatsappNumber: "529811234567" },
    });
    assert.equal(configuredSettings.status, 200);

    const repeatedSetup = await request("/api/auth/setup", {
      method: "POST",
      body: { email: "otra@example.com", password: "OtraSegura2026!" },
    });
    assert.equal(repeatedSetup.status, 409);

    const adminBootstrap = await request("/api/admin/bootstrap", {
      headers: { cookie },
    });
    assert.equal(adminBootstrap.status, 200);
    const adminData = await adminBootstrap.json();
    assert.equal(adminData.products.length, 20);
    assert.equal(adminData.products.every((item) => item.images.length > 0), true);

    const categoryResponse = await request("/api/admin/categories", {
      method: "POST",
      headers: { cookie },
      body: {
        name: "Edición especial",
        description: "Piezas de temporada",
        active: true,
        order: 5,
      },
    });
    assert.equal(categoryResponse.status, 201);
    const category = await categoryResponse.json();

    const missingPhotoProduct = await request("/api/admin/products", {
      method: "POST",
      headers: { cookie },
      body: {
        name: "Foto ausente",
        price: 100,
        categoryId: category.id,
        stockQuantity: 1,
        images: [
          "/uploads/33333333-3333-4333-8333-333333333333.png",
        ],
      },
    });
    assert.equal(missingPhotoProduct.status, 400);
    assert.equal((await missingPhotoProduct.json()).code, "IMAGE_NOT_FOUND");

    const uploadForm = new FormData();
    uploadForm.append(
      "images",
      new Blob(
        [
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        ],
        { type: "image/png" },
      ),
      "direccion-privada-original.png",
    );
    const uploadResponse = await request("/api/admin/uploads", {
      method: "POST",
      headers: { cookie },
      body: uploadForm,
    });
    assert.equal(uploadResponse.status, 201);
    const uploaded = await uploadResponse.json();
    assert.equal(uploaded.images.length, 1);
    assert.match(uploaded.images[0], /^\/uploads\/[a-f0-9-]+\.png$/);
    const publicImage = await request(uploaded.images[0]);
    assert.equal(publicImage.status, 200);
    assert.match(publicImage.headers.get("content-type"), /^image\/png/);

    const productResponse = await request("/api/admin/products", {
      method: "POST",
      headers: { cookie },
      body: {
        name: "Flor de prueba",
        shortDescription: "Tejida a mano",
        description: "Una pieza para probar el flujo.",
        price: 123.45,
        categoryId: category.id,
        status: "available",
        stockQuantity: 3,
        colors: ["Terracota"],
        sizes: ["Única"],
        images: uploaded.images,
      },
    });
    assert.equal(productResponse.status, 201);
    const product = await productResponse.json();

    const inquiryResponse = await request("/api/inquiries", {
      method: "POST",
      body: {
        customerName: "Ana",
        privacyAccepted: true,
        estimatedTotal: 1,
        items: [
          {
            productId: product.id,
            quantity: 2,
            color: "Terracota",
            size: "Única",
            unitPrice: 1,
          },
        ],
      },
    });
    assert.equal(inquiryResponse.status, 201);
    const inquiryBody = await inquiryResponse.json();
    assert.equal(inquiryBody.inquiry.estimatedTotal, 246.9);
    assert.equal(inquiryBody.inquiry.currency, "MXN");
    assert.equal(inquiryBody.inquiry.privacyVersion, "2026-09");
    assert.match(inquiryBody.inquiry.privacyAcceptedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(inquiryBody.inquiry.status, "whatsapp_opened");
    assert.match(inquiryBody.whatsappUrl, /^https:\/\/wa\.me\/529811234567\?text=/);
    assert.match(inquiryBody.whatsappMessage, /Flor de prueba × 2/);
    assert.match(inquiryBody.whatsappMessage, /\$246\.9/);
    assert.equal(inquiryBody.message, inquiryBody.whatsappMessage);
    assert.equal(
      decodeURIComponent(inquiryBody.whatsappUrl.split("?text=")[1]),
      inquiryBody.whatsappMessage,
    );

    const customInquiry = await request("/api/inquiries", {
      method: "POST",
      body: {
        customerName: "María",
        privacyAccepted: true,
        note: "Quiero un personaje personalizado.",
        items: [],
      },
    });
    assert.equal(customInquiry.status, 201);
    const customBody = await customInquiry.json();
    assert.match(customBody.whatsappMessage, /Quiero un personaje personalizado/);

    const updatedPriceResponse = await request(
      "/api/admin/products/" + product.id,
      {
        method: "PUT",
        headers: { cookie },
        body: { price: 145 },
      },
    );
    assert.equal(updatedPriceResponse.status, 200);
    assert.equal((await updatedPriceResponse.json()).price, 145);

    const unchangedPriceResponse = await request(
      "/api/admin/products/" + product.id,
      {
        method: "PUT",
        headers: { cookie },
        body: { price: 145 },
      },
    );
    assert.equal(unchangedPriceResponse.status, 200);

    const priceHistoryResponse = await request(
      "/api/admin/products/" + product.id + "/price-history",
      { headers: { cookie } },
    );
    assert.equal(priceHistoryResponse.status, 200);
    const priceHistory = await priceHistoryResponse.json();
    assert.equal(priceHistory.product.currentPrice, 145);
    assert.equal(priceHistory.history.length, 1);
    assert.equal(priceHistory.history[0].previousPrice, 123.45);
    assert.equal(priceHistory.history[0].newPrice, 145);
    assert.equal(priceHistory.history[0].currency, "MXN");

    const insightsResponse = await request("/api/admin/bootstrap", {
      headers: { cookie },
    });
    assert.equal(insightsResponse.status, 200);
    const insightsData = await insightsResponse.json();
    assert.equal(insightsData.priceHistory.length, 1);
    assert.equal(insightsData.insights.totalInquiries, 2);
    assert.equal(insightsData.insights.catalogueInquiries, 1);
    assert.equal(insightsData.insights.customInquiries, 1);
    assert.equal(insightsData.insights.totalRequestedUnits, 2);
    assert.deepEqual(
      insightsData.insights.productConsultations.find(
        (entry) => entry.productId === product.id,
      ),
      {
        productId: product.id,
        productName: "Flor de prueba",
        inquiryCount: 1,
        unitsRequested: 2,
        lastConsultedAt: inquiryBody.inquiry.createdAt,
      },
    );

    const rejectedOrigin = await request("/api/inquiries", {
      method: "POST",
      origin: "https://malicioso.example",
      body: {
        customerName: "Mal",
        privacyAccepted: true,
        note: "No debe guardarse",
        items: [],
      },
    });
    assert.equal(rejectedOrigin.status, 403);

    const privateSetting = await request("/api/admin/settings", {
      method: "PUT",
      headers: { cookie },
      body: { homeAddress: "No publicar" },
    });
    assert.equal(privateSetting.status, 400);

    const storedText = await fs.readFile(
      path.join(directory, "store.json"),
      "utf8",
    );
    assert.equal(storedText.includes("HebraSegura2026!"), false);
    assert.equal(storedText.includes(cookie.split("=")[1]), false);
    assert.equal(storedText.includes("direccion-privada-original"), false);

    const logout = await request("/api/auth/logout", {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(logout.status, 200);
    const unauthorized = await request("/api/admin/bootstrap", {
      headers: { cookie },
    });
    assert.equal(unauthorized.status, 401);
  },
);
