"use strict";

const { HttpError } = require("./errors");

const MAX_WHATSAPP_URL_LENGTH = 8_000;

function inlineText(value, fallback = "") {
  const normalized = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return normalized || fallback;
}

function formatMoney(value, currency) {
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : "MXN";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch (error) {
    return safeCurrency + " " + Number(value).toFixed(2);
  }
}

function buildWhatsappMessage(settings, inquiry) {
  const storeName = inlineText(settings.storeName, "la tienda");
  const customerName = inlineText(inquiry.customerName, "Cliente");
  const currency = inquiry.currency || settings.currency || "MXN";
  const guidedCustomization = /^personalizaci(?:ó|o)n guiada\b/iu.test(
    String(inquiry.note || "").trim(),
  );

  if (inquiry.items.length === 0) {
    return [
      "Hola, " + storeName + " 👋",
      "Soy " + customerName + ". Quisiera cotizar una pieza personalizada.",
      "",
      "Detalles: " + String(inquiry.note || "").trim(),
      "",
      "¿Podemos revisar colores, tiempo de elaboración y opciones de recogida?",
    ].join("\n");
  }

  const lines = [
    "Hola, " + storeName + " 👋",
    guidedCustomization
      ? "Soy " + customerName + ". Quisiera personalizar esta pieza base:"
      : "Soy " + customerName + ". Me interesan estas piezas:",
    "",
  ];
  inquiry.items.forEach((item, index) => {
    lines.push(
      String(index + 1) +
        ". " +
        inlineText(item.productName, "Producto") +
        " × " +
        item.quantity,
    );
    const variants = [];
    if (item.color) {
      variants.push(
        (guidedCustomization ? "Opción de color: " : "Color: ") +
          inlineText(item.color),
      );
    }
    if (item.size) {
      variants.push(
        (guidedCustomization ? "Tamaño base: " : "Talla: ") +
          inlineText(item.size),
      );
    }
    if (variants.length) lines.push("   " + variants.join(" · "));
    lines.push(
      "   " +
        (guidedCustomization ? "Precio base: " : "") +
        formatMoney(item.lineTotal, currency),
    );
  });
  lines.push(
    "",
    (guidedCustomization ? "Estimado base: " : "Total estimado: ") +
      formatMoney(inquiry.estimatedTotal, currency),
  );
  if (inquiry.note) lines.push("Nota: " + String(inquiry.note).trim());
  lines.push(
    "",
    guidedCustomization
      ? "¿Podemos confirmar los detalles, el precio final, el tiempo y la recogida? Entiendo que esta es una solicitud y aún no confirma mi pedido."
      : "¿Me confirmas disponibilidad y cómo coordinamos la recogida? Entiendo que esta es una solicitud y aún no confirma mi pedido.",
  );
  return lines.join("\n");
}

function buildWhatsappContact(settings, inquiry) {
  const number = String(settings.whatsappNumber || "").trim();
  if (!/^\+[1-9]\d{7,14}$/.test(number)) {
    throw new HttpError(
      503,
      "WHATSAPP_NOT_CONFIGURED",
      "La tienda aún no ha configurado un número de WhatsApp válido.",
    );
  }
  const whatsappMessage = buildWhatsappMessage(settings, inquiry).toWellFormed();
  const whatsappUrl =
    "https://wa.me/" + number.slice(1) + "?text=" + encodeURIComponent(whatsappMessage);
  if (whatsappUrl.length > MAX_WHATSAPP_URL_LENGTH) {
    throw new HttpError(
      422,
      "WHATSAPP_MESSAGE_TOO_LONG",
      "La selección genera un mensaje demasiado largo. Quita algunas variantes o acorta la nota.",
      { field: "items" },
    );
  }
  let parsed;
  try {
    parsed = new URL(whatsappUrl);
  } catch (error) {
    throw new HttpError(
      503,
      "WHATSAPP_NOT_CONFIGURED",
      "No fue posible preparar el enlace de WhatsApp.",
    );
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "wa.me") {
    throw new HttpError(
      503,
      "WHATSAPP_NOT_CONFIGURED",
      "No fue posible preparar el enlace de WhatsApp.",
    );
  }
  return { whatsappMessage, whatsappUrl };
}

module.exports = {
  MAX_WHATSAPP_URL_LENGTH,
  buildWhatsappContact,
  buildWhatsappMessage,
  formatMoney,
};
