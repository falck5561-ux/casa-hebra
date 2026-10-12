"use strict";

const { HttpError } = require("./errors");

const MAX_WHATSAPP_URL_LENGTH = 8_000;

function inlineText(value, fallback = "") {
  const normalized = String(value ?? "")
    .normalize("NFC")
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return normalized || fallback;
}

function multilineText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\uFFFD/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function safeQuantity(value) {
  const quantity = Number.parseInt(value, 10);

  if (!Number.isFinite(quantity) || quantity < 1) {
    return 1;
  }

  return quantity;
}

function formatMoney(value, currency = "MXN") {
  const safeCurrency = /^[A-Z]{3}$/.test(String(currency).toUpperCase())
    ? String(currency).toUpperCase()
    : "MXN";

  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `${safeCurrency} ${safeAmount.toFixed(2)}`;
  }
}

function isGuidedCustomization(note) {
  return /^personalizaci(?:ó|o)n guiada\b/iu.test(
    String(note ?? "").trim(),
  );
}

function buildProductBlock(item, index, currency, guidedCustomization) {
  const productName = inlineText(item.productName, "Producto");
  const quantity = safeQuantity(item.quantity);
  const color = inlineText(item.color);
  const size = inlineText(item.size);
  const lineTotal = formatMoney(item.lineTotal, currency);

  const lines = [
    `*${index + 1}. ${productName}*`,
    `Cantidad: ${quantity}`,
  ];

  if (color) {
    lines.push(
      guidedCustomization
        ? `Opción de color: ${color}`
        : `Color: ${color}`,
    );
  }

  if (size) {
    lines.push(
      guidedCustomization
        ? `Tamaño base: ${size}`
        : `Talla: ${size}`,
    );
  }

  lines.push(
    guidedCustomization
      ? `Precio base: *${lineTotal}*`
      : `Subtotal: *${lineTotal}*`,
  );

  return lines.join("\n");
}

function buildWhatsappMessage(settings, inquiry) {
  const storeName = inlineText(settings.storeName, "Casa Hebra");
  const customerName = inlineText(inquiry.customerName, "Cliente");
  const currency = String(
    inquiry.currency || settings.currency || "MXN",
  ).toUpperCase();

  const note = multilineText(inquiry.note);
  const items = Array.isArray(inquiry.items) ? inquiry.items : [];
  const guidedCustomization = isGuidedCustomization(note);

  if (items.length === 0) {
    const lines = [
      `Hola, *${storeName}*.`,
      "",
      `Soy *${customerName}* y me gustaría solicitar una cotización para una pieza personalizada.`,
    ];

    if (note) {
      lines.push(
        "",
        "*Detalles de mi idea:*",
        note,
      );
    }

    lines.push(
      "",
      "¿Podrían ayudarme a revisar las opciones disponibles, colores, precio, tiempo de elaboración y forma de entrega?",
      "",
      "Muchas gracias.",
    );

    return lines.join("\n");
  }

  const itemWord = items.length === 1 ? "esta pieza" : "estas piezas";

  const lines = [
    `Hola, *${storeName}*.`,
    "",
    guidedCustomization
      ? `Soy *${customerName}* y me gustaría personalizar la siguiente pieza:`
      : `Soy *${customerName}* y me interesa consultar la disponibilidad de ${itemWord}:`,
    "",
  ];

  items.forEach((item, index) => {
    lines.push(
      buildProductBlock(item, index, currency, guidedCustomization),
    );

    if (index < items.length - 1) {
      lines.push("");
    }
  });

  const total = formatMoney(inquiry.estimatedTotal, currency);

  lines.push(
    "",
    guidedCustomization
      ? `*Estimado base: ${total}*`
      : `*Total estimado: ${total}*`,
  );

  if (note && !guidedCustomization) {
    lines.push(
      "",
      "*Nota:*",
      note,
    );
  }

  lines.push("");

  if (guidedCustomization) {
    lines.push(
      "¿Podrían ayudarme a confirmar los detalles de la personalización, el precio final, el tiempo de elaboración y la forma de entrega?",
    );
  } else {
    lines.push(
      items.length === 1
        ? "¿Me confirman si está disponible y cómo podemos coordinar la entrega?"
        : "¿Me confirman la disponibilidad de estas piezas y cómo podemos coordinar la entrega?",
    );
  }

  lines.push(
    "",
    "_Entiendo que esta consulta aún no confirma mi pedido._",
    "",
    "Muchas gracias.",
  );

  return lines.join("\n");
}

function normalizeWhatsappNumber(value) {
  const number = String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "");

  if (!/^\+[1-9]\d{7,14}$/.test(number)) {
    throw new HttpError(
      503,
      "WHATSAPP_NOT_CONFIGURED",
      "La tienda aún no ha configurado un número de WhatsApp válido.",
    );
  }

  return number;
}

function buildWhatsappContact(settings, inquiry) {
  const number = normalizeWhatsappNumber(settings.whatsappNumber);

  const whatsappMessage = buildWhatsappMessage(settings, inquiry).toWellFormed();

  const whatsappUrl =
    `https://wa.me/${number.slice(1)}` +
    `?text=${encodeURIComponent(whatsappMessage)}`;

  if (whatsappUrl.length > MAX_WHATSAPP_URL_LENGTH) {
    throw new HttpError(
      422,
      "WHATSAPP_MESSAGE_TOO_LONG",
      "La selección genera un mensaje demasiado largo. Quita algunos productos, variantes o acorta la nota.",
      { field: "items" },
    );
  }

  let parsed;

  try {
    parsed = new URL(whatsappUrl);
  } catch {
    throw new HttpError(
      503,
      "WHATSAPP_NOT_CONFIGURED",
      "No fue posible preparar el enlace de WhatsApp.",
    );
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "wa.me"
  ) {
    throw new HttpError(
      503,
      "WHATSAPP_NOT_CONFIGURED",
      "No fue posible preparar el enlace de WhatsApp.",
    );
  }

  return {
    whatsappMessage,
    whatsappUrl,
  };
}

module.exports = {
  MAX_WHATSAPP_URL_LENGTH,
  buildWhatsappContact,
  buildWhatsappMessage,
  formatMoney,
};