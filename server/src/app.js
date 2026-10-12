"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const multer = require("multer");
const { JsonStore } = require("./store");
const { SupabaseStore, databaseConfig } = require("./supabase-store");
const { HttpError } = require("./errors");
const {
  createSession,
  expiredSessionCookie,
  getSession,
  hashPassword,
  isLoopbackRequest,
  publicOwner,
  rateLimit,
  removeExpiredSessions,
  requireAdmin,
  sameOrigin,
  safeSecretMatches,
  sessionCookie,
  verifyPassword,
  securityHeaders,
} = require("./security");
const {
  publicSettings,
  validateCategory,
  validateEmail,
  validateInquiry,
  validateInquiryStatus,
  validatePassword,
  validateProduct,
} = require("./validation");
const {
  cleanupOrphanUploads,
  imageUpload,
  saveUploadedImages,
} = require("./uploads");
const { pruneInquiryList, pruneStoredInquiries } = require("./inquiries");
const { storageConfig, uploadImagesToSupabase } = require("./cloud-storage");
const {
  assertProductionOrigins,
  resolveInquiryPolicy,
  resolveSetupPolicy,
  validatePublicOrigins,
} = require("./runtime-config");
const { buildWhatsappContact } = require("./whatsapp");
const {
  appendPriceChange,
  buildAdminInsights,
  recentPriceHistory,
} = require("./insights");

const PUBLIC_SETTING_FIELDS = [
  "storeName",
  "tagline",
  "heroTitle",
  "heroText",
  "story",
  "whatsappNumber",
  "city",
  "pickupLabel",
  "currency",
  "instagram",
  "businessHours",
  "announcement",
  "accentColor",
  "updatedAt",
];

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function pickPublicSettings(settings) {
  return Object.fromEntries(
    PUBLIC_SETTING_FIELDS.map((field) => [field, settings[field]]),
  );
}

function noStore(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

function requireJson(req, res, next) {
  if (!req.is("application/json")) {
    return next(
      new HttpError(
        415,
        "JSON_REQUIRED",
        "Envía los datos con formato application/json.",
      ),
    );
  }
  return next();
}

function trustProxyValue(value) {
  if (value === true || value === 1 || value === "1" || value === "true") {
    return 1;
  }
  return false;
}

function assertUniqueSlug(collection, slug, excludedId, entityLabel) {
  const duplicate = collection.find(
    (entry) => entry.id !== excludedId && entry.slug === slug,
  );
  if (duplicate) {
    throw new HttpError(
      409,
      "DUPLICATE_SLUG",
      "Ya existe " + entityLabel + " con ese identificador.",
      { field: "slug" },
    );
  }
}

function assertCategoryExists(categories, categoryId) {
  if (!categories.some((category) => category.id === categoryId)) {
    throw new HttpError(
      400,
      "UNKNOWN_CATEGORY",
      "La categoría seleccionada ya no existe.",
      { field: "categoryId" },
    );
  }
}

async function assertProductImagesExist(images, uploadDirectory) {
  for (const imageUrl of images || []) {
    if (!imageUrl.startsWith("/uploads/")) continue;

    const filename = imageUrl.slice("/uploads/".length);
    const imagePath = path.join(uploadDirectory, filename);
    let stats;
    try {
      stats = await fs.promises.lstat(imagePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    if (!stats || !stats.isFile()) {
      throw new HttpError(
        400,
        "IMAGE_NOT_FOUND",
        "Una de las fotos ya no existe. Vuelve a subirla antes de guardar.",
        { field: "images" },
      );
    }
  }
}

function findIndexOrThrow(collection, id, label) {
  const index = collection.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new HttpError(404, "NOT_FOUND", label + " no encontrado.");
  }
  return index;
}

function uploadRoute(uploadDirectory, store, cloudConfig) {
  return (req, res, next) => {
    imageUpload(req, res, async (error) => {
      if (error) return next(error);
      try {
        await cleanupOrphanUploads(
          uploadDirectory,
          store.readSections(["products", "inquiries"]),
        );
        const files = cloudConfig.configured
          ? await uploadImagesToSupabase(req.files, cloudConfig)
          : await saveUploadedImages(req.files, uploadDirectory);
        return res.status(201).json({
          images: files.map((file) => file.url),
          files,
        });
      } catch (saveError) {
        return next(saveError);
      }
    });
  };
}

async function createApp(options = {}) {
  const serverless = options.serverless !== undefined ? Boolean(options.serverless) : Boolean(process.env.VERCEL);
  const production =
    options.production !== undefined
      ? Boolean(options.production)
      : process.env.NODE_ENV === "production";
  const serverRoot = path.join(__dirname, "..");
  const dataDir = options.dataDir
    ? path.resolve(options.dataDir)
    : serverless
      ? path.join("/tmp", "casa-hebra")
      : process.env.DATA_DIR
        ? path.resolve(serverRoot, process.env.DATA_DIR)
        : path.join(serverRoot, "data");
  const clientDist = options.clientDist
    ? path.resolve(options.clientDist)
    : process.env.CLIENT_DIST
      ? path.resolve(serverRoot, process.env.CLIENT_DIST)
      : path.join(serverRoot, "..", "client", "dist");
  const uploadDirectory = path.join(dataDir, "uploads");
  const cloudConfig = storageConfig();
  const dbConfig = databaseConfig();
  const store =
    options.store ||
    (dbConfig.enabled
      ? await new SupabaseStore(dbConfig).init()
      : await new JsonStore(dataDir).init());
  const initialData = store.readSections(["auth"]);
  const explicitOrigins = validatePublicOrigins(
    options.allowedOrigins !== undefined
      ? options.allowedOrigins
      : process.env.PUBLIC_ORIGIN,
    { production },
  );
  if (!serverless) assertProductionOrigins(production, explicitOrigins);
  const setupPolicy = resolveSetupPolicy({
    production,
    hasOwner: Boolean(initialData.auth.owner),
    setupToken:
      options.setupToken !== undefined
        ? options.setupToken
        : process.env.SETUP_TOKEN,
  });
  const inquiryPolicy = resolveInquiryPolicy({
    retentionDays:
      options.inquiryRetentionDays !== undefined
        ? options.inquiryRetentionDays
        : process.env.INQUIRY_RETENTION_DAYS,
    maxInquiries:
      options.maxInquiries !== undefined
        ? options.maxInquiries
        : process.env.MAX_INQUIRIES,
  });
  await pruneStoredInquiries(store, inquiryPolicy);
  if (serverless && (!dbConfig.enabled || !cloudConfig.configured)) {
    throw new Error("Vercel requiere SUPABASE_DATABASE_ENABLED=true y Supabase Storage configurado.");
  }
  await fs.promises.mkdir(uploadDirectory, { recursive: true, mode: 0o700 });
  await cleanupOrphanUploads(
    uploadDirectory,
    store.readSections(["products", "inquiries"]),
  ).catch((error) => {
    console.error(
      JSON.stringify({
        level: "warn",
        message: "Unable to clean orphan uploads at startup.",
        reason: error.message,
      }),
    );
  });
  const uploadCleanupTimer = serverless ? null : setInterval(() => {
    cleanupOrphanUploads(
      uploadDirectory,
      store.readSections(["products", "inquiries"]),
    ).catch((error) => {
      console.error(
        JSON.stringify({
          level: "warn",
          message: "Unable to clean orphan uploads.",
          reason: error.message,
        }),
      );
    });
  }, 6 * 60 * 60 * 1000);
  if (uploadCleanupTimer) uploadCleanupTimer.unref();
  const inquiryCleanupTimer = serverless ? null : setInterval(() => {
    pruneStoredInquiries(store, inquiryPolicy).catch((error) => {
      console.error(
        JSON.stringify({
          level: "warn",
          message: "Unable to prune expired inquiries.",
          reason: error.message,
        }),
      );
    });
  }, 24 * 60 * 60 * 1000);
  if (inquiryCleanupTimer) inquiryCleanupTimer.unref();

  const app = express();
  app.disable("x-powered-by");
  app.set(
    "trust proxy",
    trustProxyValue(
      options.trustProxy !== undefined
        ? options.trustProxy
        : process.env.TRUST_PROXY,
    ),
  );

  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });
  app.use(securityHeaders);
  if (production) {
    app.use((req, res, next) => {
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
      next();
    });
  }
  const allowedOrigins = [...explicitOrigins];
  if (!production) {
    allowedOrigins.push("http://localhost:5173", "http://127.0.0.1:5173");
  }
  app.use(
    sameOrigin({
      allowedOrigins,
      requireOrigin: production,
      allowInferredOrigin: serverless || explicitOrigins.length === 0,
    }),
  );

  if (typeof store.refresh === "function") {
    app.use(asyncRoute(async (req, res, next) => {
      await store.refresh();
      next();
    }));
  }

  const setupLimiter = rateLimit({
    keyPrefix: "setup",
    limit: options.authRateLimit || 8,
    windowMs: options.authRateWindowMs || 15 * 60 * 1000,
  });
  const loginLimiter = rateLimit({
    keyPrefix: "login",
    limit: options.authRateLimit || 8,
    windowMs: options.authRateWindowMs || 15 * 60 * 1000,
  });
  const inquiryLimiter = rateLimit({
    keyPrefix: "inquiry",
    limit: options.inquiryRateLimit || 15,
    windowMs: options.inquiryRateWindowMs || 60 * 1000,
  });
  const inquiryGlobalLimiter = rateLimit({
    keyPrefix: "inquiry-global",
    keyGenerator: () => "store",
    limit: options.inquiryGlobalRateLimit || 120,
    windowMs: options.inquiryRateWindowMs || 60 * 1000,
  });
  const uploadLimiter = rateLimit({
    keyPrefix: "upload",
    limit: options.uploadRateLimit || 20,
    windowMs: options.uploadRateWindowMs || 60 * 1000,
  });
  app.use("/api/auth/setup", (req, res, next) =>
    req.method === "POST" ? setupLimiter(req, res, next) : next(),
  );
  app.use("/api/auth/login", (req, res, next) =>
    req.method === "POST" ? loginLimiter(req, res, next) : next(),
  );
  app.use("/api/inquiries", (req, res, next) =>
    req.method === "POST"
      ? inquiryGlobalLimiter(req, res, (globalError) =>
          globalError
            ? next(globalError)
            : inquiryLimiter(req, res, next),
        )
      : next(),
  );

  app.use(
    express.json({
      limit: options.jsonLimit || "256kb",
      strict: true,
      type: "application/json",
    }),
  );

  app.get("/api/health", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      status: "ok",
      service: "casa-hebra",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/store", (req, res) => {
    const data = store.readSections(["settings", "categories", "products"]);
    const activeCategoryIds = new Set(
      data.categories
        .filter((category) => category.active)
        .map((category) => category.id),
    );
    const categories = data.categories
      .filter((category) => category.active)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "es"));
    const products = data.products
      .filter(
        (product) =>
          product.active && activeCategoryIds.has(product.categoryId),
      )
      .sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          a.name.localeCompare(b.name, "es"),
      );
    const settings = pickPublicSettings(data.settings);
    res.setHeader("Cache-Control", "no-cache");
    res.json({
      settings,
      categories,
      products,
      whatsappConfigured: Boolean(settings.whatsappNumber),
      privacy: {
        inquiryRetentionDays: inquiryPolicy.retentionDays,
      },
    });
  });

  app.post(
    "/api/inquiries",
    noStore,
    requireJson,
    asyncRoute(async (req, res) => {
      const result = await store.update((draft) => {
        if (!draft.settings.whatsappNumber) {
          throw new HttpError(
            503,
            "WHATSAPP_NOT_CONFIGURED",
            "La tienda aún no ha configurado su WhatsApp.",
          );
        }
        const validated = validateInquiry(
          req.body,
          draft.products,
          draft.categories,
        );
        const now = new Date().toISOString();
        const created = {
          id: crypto.randomUUID(),
          ...validated,
          currency: draft.settings.currency,
          privacyAcceptedAt: now,
          privacyVersion: "2026-09",
          status: "whatsapp_opened",
          createdAt: now,
          updatedAt: now,
        };
        draft.inquiries.push(created);
        draft.inquiries = pruneInquiryList(
          draft.inquiries,
          inquiryPolicy,
          Date.parse(now),
        );
        const contact = buildWhatsappContact(draft.settings, created);
        return { inquiry: created, ...contact };
      });
      res.status(201).json({
        inquiryId: result.inquiry.id,
        inquiry: result.inquiry,
        whatsappUrl: result.whatsappUrl,
        whatsappMessage: result.whatsappMessage,
        message: result.whatsappMessage,
      });
    }),
  );

  app.get("/api/auth/status", noStore, (req, res) => {
    const data = store.readSections(["auth"]);
    const session = getSession(req, data);
    const authenticated = Boolean(session);
    if (!authenticated && req.headers.cookie) {
      res.setHeader("Set-Cookie", expiredSessionCookie(production));
    }
    res.json({
      authenticated,
      needsSetup: !data.auth.owner,
      setupRequiresToken:
        !data.auth.owner &&
        (production ||
          setupPolicy.tokenConfigured ||
          !isLoopbackRequest(req)),
      user: authenticated ? publicOwner(data.auth.owner) : null,
    });
  });

  app.post(
    "/api/auth/setup",
    noStore,
    requireJson,
    asyncRoute(async (req, res) => {
      if (store.readSections(["auth"]).auth.owner) {
        throw new HttpError(
          409,
          "SETUP_LOCKED",
          "La cuenta propietaria ya fue creada.",
        );
      }
      const headerToken = req.get("x-setup-token");
      const bodyToken = req.body && req.body.setupToken;
      if (
        headerToken !== undefined &&
        bodyToken !== undefined &&
        headerToken !== bodyToken
      ) {
        throw new HttpError(
          403,
          "INVALID_SETUP_TOKEN",
          "El token de configuración no es válido.",
        );
      }
      const suppliedToken =
        headerToken !== undefined ? headerToken : bodyToken;
      if (
        setupPolicy.tokenConfigured &&
        !safeSecretMatches(suppliedToken, setupPolicy.setupToken)
      ) {
        throw new HttpError(
          403,
          "INVALID_SETUP_TOKEN",
          "El token de configuración no es válido.",
        );
      }
      if (!setupPolicy.tokenConfigured && !isLoopbackRequest(req)) {
        throw new HttpError(
          403,
          "SETUP_TOKEN_REQUIRED",
          "Configura SETUP_TOKEN en el servidor para crear la cuenta desde otra red.",
        );
      }
      const email = validateEmail(req.body && req.body.email);
      const password = validatePassword(req.body && req.body.password);
      const passwordHash = await hashPassword(password);
      const ownerId = crypto.randomUUID();
      const session = createSession(ownerId);
      const owner = await store.update((draft) => {
        if (draft.auth.owner) {
          throw new HttpError(
            409,
            "SETUP_LOCKED",
            "La cuenta propietaria ya fue creada.",
          );
        }
        const now = new Date().toISOString();
        const created = {
          id: ownerId,
          email,
          passwordHash,
          createdAt: now,
          updatedAt: now,
        };
        draft.auth.owner = created;
        draft.auth.sessions = [session.record];
        return created;
      });
      res.setHeader("Set-Cookie", sessionCookie(session.token, production));
      res.status(201).json({
        authenticated: true,
        needsSetup: false,
        setupRequiresToken: false,
        user: publicOwner(owner),
      });
    }),
  );

  app.post(
    "/api/auth/login",
    noStore,
    requireJson,
    asyncRoute(async (req, res) => {
      const email = validateEmail(req.body && req.body.email);
      const password = validatePassword(req.body && req.body.password);
      const snapshot = store.readSections(["auth"]);
      if (!snapshot.auth.owner) {
        throw new HttpError(
          409,
          "SETUP_REQUIRED",
          "Primero crea la cuenta propietaria.",
        );
      }
      const passwordMatches = await verifyPassword(
        password,
        snapshot.auth.owner.passwordHash,
      );
      const valid = email === snapshot.auth.owner.email && passwordMatches;
      if (!valid) {
        throw new HttpError(
          401,
          "INVALID_CREDENTIALS",
          "El correo o la contraseña no son correctos.",
        );
      }

      const session = createSession(snapshot.auth.owner.id);
      const owner = await store.update((draft) => {
        if (
          !draft.auth.owner ||
          draft.auth.owner.id !== snapshot.auth.owner.id
        ) {
          throw new HttpError(
            401,
            "INVALID_CREDENTIALS",
            "El correo o la contraseña no son correctos.",
          );
        }
        draft.auth.sessions = removeExpiredSessions(draft.auth.sessions);
        draft.auth.sessions.push(session.record);
        draft.auth.sessions = draft.auth.sessions.slice(-8);
        return draft.auth.owner;
      });
      res.setHeader("Set-Cookie", sessionCookie(session.token, production));
      res.json({
        authenticated: true,
        needsSetup: false,
        setupRequiresToken: false,
        user: publicOwner(owner),
      });
    }),
  );

  app.post(
    "/api/auth/logout",
    noStore,
    asyncRoute(async (req, res) => {
      const snapshot = store.readSections(["auth"]);
      const session = getSession(req, snapshot);
      if (session) {
        await store.update((draft) => {
          draft.auth.sessions = draft.auth.sessions.filter(
            (candidate) => candidate.id !== session.id,
          );
        });
      }
      res.setHeader("Set-Cookie", expiredSessionCookie(production));
      res.json({
        authenticated: false,
        needsSetup: !snapshot.auth.owner,
        setupRequiresToken:
          !snapshot.auth.owner &&
          (production ||
            setupPolicy.tokenConfigured ||
            !isLoopbackRequest(req)),
      });
    }),
  );

  app.use("/api/admin", noStore, requireAdmin(store, { production }));

  app.get("/api/admin/bootstrap", (req, res) => {
    const data = store.readSections([
      "settings",
      "categories",
      "products",
      "productPriceHistory",
      "inquiries",
    ]);
    res.json({
      settings: pickPublicSettings(data.settings),
      categories: data.categories.sort(
        (a, b) => a.order - b.order || a.name.localeCompare(b.name, "es"),
      ),
      products: data.products.sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
      inquiries: data.inquiries.sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
      priceHistory: recentPriceHistory(data.productPriceHistory),
      insights: buildAdminInsights(data.products, data.inquiries),
      privacy: {
        inquiryRetentionDays: inquiryPolicy.retentionDays,
      },
      user: req.admin,
    });
  });

  app.post(
    "/api/admin/uploads",
    uploadLimiter,
    uploadRoute(uploadDirectory, store, cloudConfig),
  );

  app.post(
    "/api/admin/products",
    requireJson,
    asyncRoute(async (req, res) => {
      const product = await store.update(async (draft) => {
        const validated = validateProduct(req.body);
        await assertProductImagesExist(validated.images, uploadDirectory);
        assertUniqueSlug(draft.products, validated.slug, null, "un producto");
        assertCategoryExists(draft.categories, validated.categoryId);
        const now = new Date().toISOString();
        const created = {
          id: crypto.randomUUID(),
          ...validated,
          createdAt: now,
          updatedAt: now,
        };
        draft.products.push(created);
        return created;
      });
      res.status(201).json(product);
    }),
  );

  app.put(
    "/api/admin/products/:id",
    requireJson,
    asyncRoute(async (req, res) => {
      const product = await store.update(async (draft) => {
        const index = findIndexOrThrow(
          draft.products,
          req.params.id,
          "Producto",
        );
        const current = draft.products[index];
        const validated = validateProduct(req.body, current);
        await assertProductImagesExist(validated.images, uploadDirectory);
        assertUniqueSlug(
          draft.products,
          validated.slug,
          current.id,
          "un producto",
        );
        assertCategoryExists(draft.categories, validated.categoryId);
        const updated = {
          ...current,
          ...validated,
          updatedAt: new Date().toISOString(),
        };
        if (updated.price !== current.price) {
          draft.productPriceHistory = appendPriceChange(
            draft.productPriceHistory,
            {
              productId: current.id,
              productName: updated.name,
              previousPrice: current.price,
              newPrice: updated.price,
              currency: draft.settings.currency,
              changedAt: updated.updatedAt,
            },
          );
        }
        draft.products[index] = updated;
        return updated;
      });
      res.json(product);
    }),
  );

  app.get("/api/admin/products/:id/price-history", (req, res) => {
    const data = store.readSections([
      "settings",
      "products",
      "productPriceHistory",
    ]);
    const index = findIndexOrThrow(data.products, req.params.id, "Producto");
    const product = data.products[index];
    res.json({
      product: {
        id: product.id,
        name: product.name,
        currentPrice: product.price,
        currency: data.settings.currency,
      },
      history: recentPriceHistory(
        (data.productPriceHistory || []).filter(
          (entry) => entry.productId === product.id,
        ),
      ),
    });
  });

  app.delete(
    "/api/admin/products/:id",
    asyncRoute(async (req, res) => {
      const deletedId = await store.update((draft) => {
        const index = findIndexOrThrow(
          draft.products,
          req.params.id,
          "Producto",
        );
        const [removed] = draft.products.splice(index, 1);
        draft.productPriceHistory = (draft.productPriceHistory || []).filter(
          (entry) => entry.productId !== removed.id,
        );
        return removed.id;
      });
      res.json({ success: true, id: deletedId });
    }),
  );

  app.post(
    "/api/admin/categories",
    requireJson,
    asyncRoute(async (req, res) => {
      const category = await store.update((draft) => {
        const validated = validateCategory(req.body);
        assertUniqueSlug(
          draft.categories,
          validated.slug,
          null,
          "una categoría",
        );
        const now = new Date().toISOString();
        const created = {
          id: crypto.randomUUID(),
          ...validated,
          createdAt: now,
          updatedAt: now,
        };
        draft.categories.push(created);
        return created;
      });
      res.status(201).json(category);
    }),
  );

  app.put(
    "/api/admin/categories/:id",
    requireJson,
    asyncRoute(async (req, res) => {
      const category = await store.update((draft) => {
        const index = findIndexOrThrow(
          draft.categories,
          req.params.id,
          "Categoría",
        );
        const current = draft.categories[index];
        const validated = validateCategory(req.body, current);
        assertUniqueSlug(
          draft.categories,
          validated.slug,
          current.id,
          "una categoría",
        );
        const updated = {
          ...current,
          ...validated,
          updatedAt: new Date().toISOString(),
        };
        draft.categories[index] = updated;
        return updated;
      });
      res.json(category);
    }),
  );

  app.delete(
    "/api/admin/categories/:id",
    asyncRoute(async (req, res) => {
      const deletedId = await store.update((draft) => {
        const index = findIndexOrThrow(
          draft.categories,
          req.params.id,
          "Categoría",
        );
        const category = draft.categories[index];
        if (
          draft.products.some(
            (product) => product.categoryId === category.id,
          )
        ) {
          throw new HttpError(
            409,
            "CATEGORY_IN_USE",
            "Mueve o elimina sus productos antes de borrar esta categoría.",
          );
        }
        draft.categories.splice(index, 1);
        return category.id;
      });
      res.json({ success: true, id: deletedId });
    }),
  );

  app.put(
    "/api/admin/settings",
    requireJson,
    asyncRoute(async (req, res) => {
      const settings = await store.update((draft) => {
        const validated = publicSettings(req.body, draft.settings);
        validated.updatedAt = new Date().toISOString();
        draft.settings = validated;
        return pickPublicSettings(validated);
      });
      res.json(settings);
    }),
  );

  app.patch(
    "/api/admin/inquiries/:id",
    requireJson,
    asyncRoute(async (req, res) => {
      if (!req.body || Object.keys(req.body).some((key) => key !== "status")) {
        throw new HttpError(
          400,
          "VALIDATION_ERROR",
          "Solo se puede actualizar el estado de la solicitud.",
        );
      }
      const status = validateInquiryStatus(req.body.status);
      if (!status) {
        throw new HttpError(
          400,
          "VALIDATION_ERROR",
          "Selecciona un estado válido.",
          { field: "status" },
        );
      }
      const inquiry = await store.update((draft) => {
        const index = findIndexOrThrow(
          draft.inquiries,
          req.params.id,
          "Solicitud",
        );
        const updated = {
          ...draft.inquiries[index],
          status,
          updatedAt: new Date().toISOString(),
        };
        draft.inquiries[index] = updated;
        return updated;
      });
      res.json(inquiry);
    }),
  );

  app.delete(
    "/api/admin/inquiries/:id",
    asyncRoute(async (req, res) => {
      const deletedId = await store.update((draft) => {
        const index = findIndexOrThrow(
          draft.inquiries,
          req.params.id,
          "Solicitud",
        );
        const [removed] = draft.inquiries.splice(index, 1);
        return removed.id;
      });
      res.json({ success: true, id: deletedId });
    }),
  );

  app.use(
    "/uploads",
    express.static(uploadDirectory, {
      fallthrough: true,
      index: false,
      immutable: true,
      maxAge: "1y",
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );
  app.use("/uploads", (req, res, next) =>
    next(new HttpError(404, "NOT_FOUND", "Imagen no encontrada.")),
  );

  app.use("/api", (req, res, next) =>
    next(new HttpError(404, "API_NOT_FOUND", "Ruta de API no encontrada.")),
  );

  const hasClient = !serverless && fs.existsSync(path.join(clientDist, "index.html"));
  if (hasClient) {
    app.use(
      express.static(clientDist, {
        index: false,
        setHeaders(res, filePath) {
          const [topLevelDirectory] = path
            .relative(clientDist, filePath)
            .split(path.sep);
          if (topLevelDirectory === "assets") {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );
    app.get("*", (req, res, next) => {
      if (!req.accepts("html")) return next();
      res.setHeader("Cache-Control", "no-cache");
      return res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  app.use((req, res, next) =>
    next(new HttpError(404, "NOT_FOUND", "Página no encontrada.")),
  );

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    let status = Number(error.status || error.statusCode) || 500;
    let code = error.code || "INTERNAL_ERROR";
    let message = error.message || "Ocurrió un error inesperado.";
    let details = error.details;

    if (error instanceof multer.MulterError) {
      status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      code = error.code;
      message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Cada imagen puede pesar máximo 6 MB."
          : error.code === "LIMIT_FILE_COUNT" ||
              error.code === "LIMIT_UNEXPECTED_FILE"
            ? "Puedes subir hasta 5 imágenes usando el campo images."
            : "No fue posible procesar las imágenes.";
      details = undefined;
    } else if (error.type === "entity.too.large") {
      status = 413;
      code = "JSON_TOO_LARGE";
      message = "La solicitud es demasiado grande.";
      details = undefined;
    } else if (error.type === "entity.parse.failed") {
      status = 400;
      code = "INVALID_JSON";
      message = "El contenido JSON no es válido.";
      details = undefined;
    } else if (!(error instanceof HttpError) && status < 500) {
      message = status === 404 ? "Recurso no encontrado." : message;
    } else if (!(error instanceof HttpError) && status >= 500) {
      console.error(
        JSON.stringify({
          level: "error",
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl,
          message: error.message,
        }),
      );
      message = "Ocurrió un error inesperado. Inténtalo de nuevo.";
      code = "INTERNAL_ERROR";
      details = undefined;
    }

    res.status(status).json({
      error: message,
      message,
      code,
      ...(details ? { details } : {}),
      requestId: req.requestId,
    });
  });

  return {
    app,
    store,
    config: {
      clientDist,
      dataDir,
      production,
      uploadDirectory,
      inquiryRetentionDays: inquiryPolicy.retentionDays,
      maxInquiries: inquiryPolicy.maxInquiries,
      serverless,
    },
  };
}

module.exports = {
  createApp,
};
