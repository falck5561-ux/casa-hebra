"use strict";

const { HttpError } = require("./errors");
const { isConfiguredStorageUrl } = require("./cloud-storage");

const PRODUCT_STATUSES = new Set([
  "available",
  "made_to_order",
  "sold_out",
]);
const INQUIRY_STATUSES = new Set([
  "whatsapp_opened",
  "contacted",
  "confirmed",
  "completed",
  "archived",
]);
const ADDRESS_FIELDS = new Set([
  "address",
  "homeAddress",
  "pickupAddress",
  "exactAddress",
  "pickupInstructions",
  "direccion",
  "dirección",
  "domicilio",
]);
const PRIVATE_LOCATION_PATTERNS = [
  /\b(?:calle|callejón|avenida|av\.?|boulevard|blvd\.?|carretera|privada|andador)\b.{0,80}\b\d{1,6}\b/iu,
  /\b(?:n(?:ú|u)mero|n(?:ú|u)m\.?|casa|departamento|depto\.?|lote|manzana)\s*#?\s*\d{1,6}\b/iu,
  /\b(?:c\.?\s*p\.?|código\s+postal)\s*:?\s*\d{5}\b/iu,
  /\b(?:maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl)\b/iu,
  /\b-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/u,
];
const LOCATION_LINK_PATTERN =
  /(?:https?:\/\/|www\.|waze(?:\.com|:\/\/)|maps(?:\.app)?\.google|goo\.gl\/maps|maps\.apple)/iu;
const PICKUP_ADDRESS_TERM_PATTERN =
  /\b(?:calle|callejón|avenida|av\.?|boulevard|blvd\.?|carretera|privada|andador|domicilio|direcci(?:ó|o)n|casa|departamento|depto\.?|lote|manzana)\b/iu;
const DEMO_IMAGES = new Set([
  "/demo/oso-canela.svg",
  "/demo/conejita-nube.svg",
  "/demo/bolso-avellana.svg",
  "/demo/ramo-tulipanes.svg",
  "/demo/sombrero-salvia.svg",
  "/demo/ballena-azul.svg",
  "/demo/tote-margaritas.svg",
  "/demo/flores-de-mesa.svg",
]);
const BUNDLED_PRODUCT_IMAGES = new Set([
  "/products/pulpi-fucsia.webp",
  "/products/girasol-sol-de-miel.webp",
  "/products/fresita-primavera.webp",
  "/products/margarita-luz.webp",
  "/products/mini-cactus-rosita.webp",
  "/products/rosa-sol.webp",
  "/products/osito-corazon.webp",
  "/products/pollito-fresa.webp",
  "/products/pulpi-cielo.webp",
  "/products/pinguina-lavanda.webp",
  "/products/pollito-primavera.webp",
  "/products/conijelado-fresa.webp",
  "/products/michi-turquesa.webp",
  "/products/besito-perruno.webp",
  "/products/cerdito-bombon.webp",
  "/products/tortuguita-rosita.webp",
  "/products/violeta-en-flor.webp",
  "/products/pinguinito-aqua.webp",
  "/products/abejita-arcoiris.webp",
  "/products/capi-aventurero.webp",
]);
const LOCAL_UPLOAD_PATTERN =
  /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

function invalid(field, message) {
  throw new HttpError(400, "VALIDATION_ERROR", message, { field });
}

function plainObject(value, label = "Los datos") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      label + " deben enviarse como un objeto JSON.",
    );
  }
  return value;
}

function stringField(value, field, options = {}) {
  const {
    required = false,
    min = 0,
    max = 200,
    allowEmpty = !required,
  } = options;
  if (value === undefined || value === null) {
    if (required) invalid(field, "El campo " + field + " es obligatorio.");
    return undefined;
  }
  if (typeof value !== "string") {
    invalid(field, "El campo " + field + " debe ser texto.");
  }
  const normalized = value.trim();
  if (!normalized.isWellFormed()) {
    invalid(field, "El campo " + field + " contiene caracteres no válidos.");
  }
  if (!allowEmpty && normalized.length === 0) {
    invalid(field, "El campo " + field + " no puede estar vacío.");
  }
  if (normalized.length < min || normalized.length > max) {
    invalid(
      field,
      "El campo " +
        field +
        " debe tener entre " +
        min +
        " y " +
        max +
        " caracteres.",
    );
  }
  return normalized;
}

function booleanField(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    invalid(field, "El campo " + field + " debe ser verdadero o falso.");
  }
  return value;
}

function numberField(value, field, options = {}) {
  const { min = 0, max = 10_000_000, integer = false, nullable = false } =
    options;
  if (value === undefined) return undefined;
  if (value === null && nullable) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value)) ||
    value < min ||
    value > max
  ) {
    invalid(
      field,
      "El campo " + field + " contiene un número fuera del rango permitido.",
    );
  }
  return value;
}

function enumField(value, field, allowed) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.has(value)) {
    invalid(field, "El campo " + field + " contiene una opción no válida.");
  }
  return value;
}

function stringList(value, field, maxItems = 20) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) {
    invalid(
      field,
      "El campo " + field + " debe ser una lista de máximo " + maxItems + ".",
    );
  }

  const normalized = value.map((entry, index) => {
    if (typeof entry !== "string") {
      invalid(field + "[" + index + "]", "Cada opción debe ser texto.");
    }
    const text = entry.trim();
    if (text.length < 1 || text.length > 60) {
      invalid(
        field + "[" + index + "]",
        "Cada opción debe tener entre 1 y 60 caracteres.",
      );
    }
    return text;
  });
  return [...new Set(normalized)];
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function slugField(value, fallbackName) {
  if (value === undefined || value === null || value === "") {
    const generated = slugify(fallbackName || "");
    if (!generated) invalid("slug", "No fue posible generar el identificador.");
    return generated;
  }
  const supplied = stringField(value, "slug", {
    required: true,
    min: 2,
    max: 100,
    allowEmpty: false,
  });
  const normalized = slugify(supplied);
  if (normalized !== supplied.toLowerCase()) {
    invalid(
      "slug",
      "El identificador solo puede usar letras, números y guiones.",
    );
  }
  return normalized;
}

function normalizeWhatsapp(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    invalid("whatsappNumber", "El número de WhatsApp debe ser texto.");
  }
  const trimmed = value.trim();
  if (!trimmed) return "";

  let normalized = trimmed
    .replace(/[()\s.-]/g, "")
    .replace(/^00/, "+");
  if (!normalized.startsWith("+")) normalized = "+" + normalized;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    invalid(
      "whatsappNumber",
      "Escribe el número con código de país, por ejemplo +529811234567.",
    );
  }
  return normalized;
}

function rejectLikelyPrivateAddress(value, field) {
  if (
    typeof value === "string" &&
    PRIVATE_LOCATION_PATTERNS.some((pattern) => pattern.test(value))
  ) {
    throw new HttpError(
      400,
      "PRIVATE_ADDRESS_NOT_ALLOWED",
      "Publica solo una ciudad o zona general; acuerda el punto exacto por WhatsApp.",
      { field },
    );
  }
}

function rejectUnsafePublicLocation(value, field) {
  if (typeof value !== "string" || !value) return;
  const containsUnsafeLocation =
    LOCATION_LINK_PATTERN.test(value) ||
    /\d/u.test(value) ||
    (field === "pickupLabel" && PICKUP_ADDRESS_TERM_PATTERN.test(value));
  if (containsUnsafeLocation) {
    throw new HttpError(
      400,
      "PRIVATE_ADDRESS_NOT_ALLOWED",
      field === "city"
        ? "Publica solo el nombre general de la ciudad o zona, sin enlaces ni números."
        : "Describe la recogida de forma general; acuerda la ubicación exacta por WhatsApp.",
      { field },
    );
  }
}

function validateEmail(value) {
  const email = stringField(value, "email", {
    required: true,
    min: 5,
    max: 160,
    allowEmpty: false,
  }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    invalid("email", "Escribe un correo válido.");
  }
  return email;
}

function validatePassword(value) {
  if (typeof value !== "string" || value.length < 10 || value.length > 128) {
    invalid(
      "password",
      "La contraseña debe tener entre 10 y 128 caracteres.",
    );
  }
  if (!/\p{L}/u.test(value) || !/\d/.test(value)) {
    invalid(
      "password",
      "La contraseña debe incluir al menos una letra y un número.",
    );
  }
  return value;
}

function validateCategory(input, current = null) {
  const body = plainObject(input);
  const name =
    body.name !== undefined
      ? stringField(body.name, "name", {
          required: true,
          min: 2,
          max: 80,
          allowEmpty: false,
        })
      : current && current.name;
  if (!name) invalid("name", "El nombre de la categoría es obligatorio.");

  const slug =
    body.slug !== undefined || !current
      ? slugField(body.slug, name)
      : current.slug;
  const description =
    stringField(body.description, "description", { max: 300 }) ??
    (current ? current.description : "");
  const icon =
    stringField(body.icon, "icon", { max: 40 }) ??
    (current ? current.icon : "sparkles");
  const active =
    booleanField(body.active, "active") ??
    (current ? current.active : true);
  const order =
    numberField(body.order, "order", {
      min: 0,
      max: 10_000,
      integer: true,
    }) ?? (current ? current.order : 0);

  const category = { name, slug, description, icon, active, order };
  rejectLikelyPrivateAddress(category.name, "name");
  rejectLikelyPrivateAddress(category.description, "description");
  return category;
}

function normalizeImageUrl(value, field) {
  const url = stringField(value, field, {
    required: true,
    min: 1,
    max: 500,
    allowEmpty: false,
  });
  if (
    LOCAL_UPLOAD_PATTERN.test(url) ||
    DEMO_IMAGES.has(url) ||
    BUNDLED_PRODUCT_IMAGES.has(url) ||
    isConfiguredStorageUrl(url)
  ) {
    return url;
  }
  invalid(field, "La ruta de imagen no es válida.");
}

function imageList(value, field = "images") {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 5) {
    invalid(field, "Puedes guardar un máximo de 5 imágenes por producto.");
  }
  return [...new Set(value.map((entry, index) => normalizeImageUrl(entry, field + "[" + index + "]")))];
}

function validateProduct(input, current = null) {
  const body = plainObject(input);
  const name =
    body.name !== undefined
      ? stringField(body.name, "name", {
          required: true,
          min: 2,
          max: 100,
          allowEmpty: false,
        })
      : current && current.name;
  if (!name) invalid("name", "El nombre del producto es obligatorio.");

  const slug =
    body.slug !== undefined || !current
      ? slugField(body.slug, name)
      : current.slug;
  const categoryId =
    stringField(body.categoryId, "categoryId", {
      required: !current,
      min: 2,
      max: 100,
      allowEmpty: false,
    }) ?? (current && current.categoryId);
  if (!categoryId) invalid("categoryId", "Selecciona una categoría.");

  const price =
    numberField(body.price, "price", { min: 0, max: 10_000_000 }) ??
    (current && current.price);
  if (price === undefined || price === null) {
    invalid("price", "El precio es obligatorio.");
  }
  const compareAtPrice =
    body.compareAtPrice !== undefined
      ? numberField(body.compareAtPrice, "compareAtPrice", {
          min: 0,
          max: 10_000_000,
          nullable: true,
        })
      : current
        ? current.compareAtPrice
        : null;
  if (compareAtPrice !== null && compareAtPrice <= price) {
    invalid(
      "compareAtPrice",
      "El precio anterior debe ser mayor que el precio actual.",
    );
  }

  const product = {
    name,
    slug,
    shortDescription:
      stringField(body.shortDescription, "shortDescription", { max: 180 }) ??
      (current ? current.shortDescription : ""),
    description:
      stringField(body.description, "description", { max: 4000 }) ??
      (current ? current.description : ""),
    price: Math.round(price * 100) / 100,
    compareAtPrice:
      compareAtPrice === null
        ? null
        : Math.round(compareAtPrice * 100) / 100,
    categoryId,
    status:
      enumField(body.status, "status", PRODUCT_STATUSES) ??
      (current ? current.status : "available"),
    stockQuantity:
      numberField(body.stockQuantity, "stockQuantity", {
        min: 0,
        max: 1_000_000,
        integer: true,
      }) ?? (current ? current.stockQuantity : 0),
    leadTime:
      stringField(body.leadTime, "leadTime", { max: 100 }) ??
      (current ? current.leadTime : ""),
    featured:
      booleanField(body.featured, "featured") ??
      (current ? current.featured : false),
    active:
      booleanField(body.active, "active") ??
      (current ? current.active : true),
    customizable:
      booleanField(body.customizable, "customizable") ??
      (current ? current.customizable : false),
    colors:
      stringList(body.colors, "colors") ??
      (current ? current.colors : []),
    sizes:
      stringList(body.sizes, "sizes") ??
      (current ? current.sizes : []),
    materials:
      stringField(body.materials, "materials", { max: 500 }) ??
      (current ? current.materials : ""),
    images: imageList(
      body.images !== undefined
        ? body.images
        : current
          ? current.images
          : [],
    ),
  };
  if (product.status === "available" && product.stockQuantity < 1) {
    invalid(
      "stockQuantity",
      "Un producto disponible debe tener al menos una unidad. Si no hay piezas, márcalo como agotado o sobre pedido.",
    );
  }
  for (const field of [
    "name",
    "shortDescription",
    "description",
    "leadTime",
    "materials",
  ]) {
    rejectLikelyPrivateAddress(product[field], field);
  }
  return product;
}

function publicSettings(input, current) {
  const body = plainObject(input);
  for (const key of Object.keys(body)) {
    if (ADDRESS_FIELDS.has(key)) {
      throw new HttpError(
        400,
        "PRIVATE_ADDRESS_NOT_ALLOWED",
        "La dirección exacta no se guarda ni se publica en esta página.",
        { field: key },
      );
    }
  }

  const next = { ...current };
  const textFields = {
    storeName: [2, 80],
    tagline: [0, 140],
    heroTitle: [2, 140],
    heroText: [0, 500],
    story: [0, 3000],
    city: [0, 120],
    pickupLabel: [2, 240],
    instagram: [0, 240],
    businessHours: [0, 240],
    announcement: [0, 180],
  };

  for (const [field, [min, max]] of Object.entries(textFields)) {
    if (body[field] !== undefined) {
      next[field] = stringField(body[field], field, {
        min,
        max,
        allowEmpty: min === 0,
      });
      rejectLikelyPrivateAddress(next[field], field);
      if (field === "city" || field === "pickupLabel") {
        rejectUnsafePublicLocation(next[field], field);
      }
    }
  }
  if (body.whatsappNumber !== undefined) {
    next.whatsappNumber = normalizeWhatsapp(body.whatsappNumber);
  }
  if (body.currency !== undefined) {
    const currency = stringField(body.currency, "currency", {
      required: true,
      min: 3,
      max: 3,
      allowEmpty: false,
    }).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      invalid("currency", "La moneda debe usar un código de tres letras.");
    }
    next.currency = currency;
  }
  if (body.accentColor !== undefined) {
    const color = stringField(body.accentColor, "accentColor", {
      required: true,
      min: 4,
      max: 9,
      allowEmpty: false,
    });
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      invalid("accentColor", "Usa un color hexadecimal de seis dígitos.");
    }
    next.accentColor = color.toUpperCase();
  }
  return next;
}

function productPriceForSize(product, size) {
  const basePrice = Math.round((Number(product.price) || 0) * 100) / 100;
  if (!size || !Array.isArray(product.sizes) || !product.sizes.includes(size)) {
    return basePrice;
  }
  const match = String(size).match(/·\s*\$\s*(\d{1,7}(?:[.,]\d{1,2})?)\s*$/);
  if (!match) return basePrice;
  const variantPrice = Number(match[1].replace(",", "."));
  return Number.isFinite(variantPrice) && variantPrice >= 0
    ? Math.round(variantPrice * 100) / 100
    : basePrice;
}

function validateInquiry(input, products, categories) {
  const body = plainObject(input);
  if (body.privacyAccepted !== true) {
    invalid(
      "privacyAccepted",
      "Debes aceptar el aviso de privacidad y conservación antes de continuar.",
    );
  }
  const customerName = stringField(body.customerName, "customerName", {
    required: true,
    min: 2,
    max: 80,
    allowEmpty: false,
  });
  const note = stringField(body.note, "note", { max: 1200 }) || "";
  const rawItems = body.items === undefined ? [] : body.items;
  if (!Array.isArray(rawItems) || rawItems.length > 20) {
    invalid("items", "La solicitud admite un máximo de 20 productos.");
  }
  if (rawItems.length === 0 && note.length < 3) {
    invalid(
      "items",
      "Agrega al menos un producto o describe tu pedido personalizado.",
    );
  }

  const activeCategoryIds = categories
    ? new Set(
        categories
          .filter((category) => category.active)
          .map((category) => category.id),
      )
    : null;
  const items = rawItems.map((rawItem, index) => {
    const item = plainObject(rawItem, "Cada producto");
    const productId = stringField(item.productId, "items[" + index + "].productId", {
      required: true,
      min: 2,
      max: 100,
      allowEmpty: false,
    });
    const quantity = numberField(
      item.quantity === undefined ? 1 : item.quantity,
      "items[" + index + "].quantity",
      { min: 1, max: 20, integer: true },
    );
    const product = products.find(
      (candidate) =>
        candidate.id === productId &&
        candidate.active &&
        (!activeCategoryIds || activeCategoryIds.has(candidate.categoryId)) &&
        candidate.status !== "sold_out",
    );
    if (!product) {
      invalid(
        "items[" + index + "].productId",
        "Uno de los productos ya no está disponible.",
      );
    }

    const color =
      stringField(item.color, "items[" + index + "].color", { max: 60 }) || "";
    const size =
      stringField(item.size, "items[" + index + "].size", { max: 60 }) || "";
    if (product.colors.length > 0 && !color) {
      invalid(
        "items[" + index + "].color",
        "Selecciona un color disponible para este producto.",
      );
    }
    if (color && !product.colors.includes(color)) {
      invalid(
        "items[" + index + "].color",
        "El color elegido no está disponible para este producto.",
      );
    }
    if (product.sizes.length > 0 && !size) {
      invalid(
        "items[" + index + "].size",
        "Selecciona una talla disponible para este producto.",
      );
    }
    if (size && !product.sizes.includes(size)) {
      invalid(
        "items[" + index + "].size",
        "El tamaño elegido no está disponible para este producto.",
      );
    }
    const unitPrice = productPriceForSize(product, size);
    return {
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      quantity,
      color,
      size,
      unitPrice,
      lineTotal: Math.round(unitPrice * quantity * 100) / 100,
      image: product.images[0] || "",
    };
  });

  const quantities = new Map();
  for (const item of items) {
    quantities.set(
      item.productId,
      (quantities.get(item.productId) || 0) + item.quantity,
    );
  }
  for (const [productId, quantity] of quantities) {
    const product = products.find((candidate) => candidate.id === productId);
    if (product.status === "available" && quantity > product.stockQuantity) {
      invalid(
        "items",
        "La cantidad total supera las piezas disponibles para consulta.",
      );
    }
  }

  return {
    customerName,
    note,
    items,
    estimatedTotal:
      Math.round(
        items.reduce((sum, item) => sum + item.lineTotal, 0) * 100,
      ) / 100,
  };
}

function validateInquiryStatus(value) {
  return enumField(value, "status", INQUIRY_STATUSES);
}

module.exports = {
  INQUIRY_STATUSES,
  PRODUCT_STATUSES,
  normalizeWhatsapp,
  publicSettings,
  slugify,
  validateCategory,
  validateEmail,
  validateInquiry,
  validateInquiryStatus,
  validatePassword,
  validateProduct,
};
