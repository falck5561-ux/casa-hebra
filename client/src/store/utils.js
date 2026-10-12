export function formatMoney(value, currency = "MXN") {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency || "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  } catch {
    return `$${Number(value || 0).toFixed(0)}`;
  }
}

export function productPriceForSize(product, size = "") {
  const basePrice = Math.max(0, Number(product?.price) || 0);
  const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
  if (!size || !sizes.includes(size)) return basePrice;
  const match = String(size).match(/·\s*\$\s*(\d{1,7}(?:[.,]\d{1,2})?)\s*$/);
  if (!match) return basePrice;
  const variantPrice = Number(match[1].replace(",", "."));
  return Number.isFinite(variantPrice) && variantPrice >= 0
    ? variantPrice
    : basePrice;
}

export function hasPricedSizes(product) {
  return (Array.isArray(product?.sizes) ? product.sizes : []).some((size) =>
    /·\s*\$\s*\d{1,7}(?:[.,]\d{1,2})?\s*$/.test(String(size)),
  );
}

export function normalizePhone(value = "") {
  return String(value).replace(/\D/g, "");
}

export function hasValidWhatsApp(value) {
  const phone = normalizePhone(value);
  return phone.length >= 8 && phone.length <= 15 && phone[0] !== "0";
}

export function whatsappUrl(number, message) {
  return `https://wa.me/${normalizePhone(number)}?text=${encodeURIComponent(message)}`;
}

export function instagramUrl(value = "") {
  const candidate = String(value).trim();
  if (!candidate) return "";
  if (/^@?[a-z\d._]{1,30}$/i.test(candidate)) {
    return `https://instagram.com/${candidate.replace(/^@/, "")}`;
  }
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" &&
      (host === "instagram.com" || host.endsWith(".instagram.com"))
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
}

export function productStatus(product) {
  if (
    product.status === "sold_out" ||
    (product.status === "available" && Number(product.stockQuantity) <= 0)
  ) {
    return { label: "Agotado", tone: "muted" };
  }
  if (product.status === "made_to_order") {
    return { label: "Sobre pedido", tone: "sage" };
  }
  if (Number(product.stockQuantity) > 0 && Number(product.stockQuantity) <= 3) {
    return { label: `Últimas ${product.stockQuantity}`, tone: "warm" };
  }
  return { label: "Disponible", tone: "light" };
}

export function buildBagMessage({ settings, customerName, note, items, total }) {
  const lines = [
    `Hola, ${settings.storeName || "Casa Hebra"} 👋`,
    `Soy ${customerName}. Me interesan estas piezas:`,
    "",
  ];

  items.forEach((item, index) => {
    const variants = [item.color && `Color: ${item.color}`, item.size && `Talla: ${item.size}`]
      .filter(Boolean)
      .join(" · ");
    lines.push(
      `${index + 1}. ${item.name} × ${item.quantity} — ${formatMoney(item.price * item.quantity, settings.currency)}`,
    );
    if (variants) lines.push(`   ${variants}`);
  });

  lines.push(
    "",
    `Total estimado: ${formatMoney(total, settings.currency)}`,
  );
  if (note.trim()) lines.push(`Nota: ${note.trim()}`);
  lines.push(
    "",
    "¿Me confirmas disponibilidad y cómo coordinamos la recogida? Entiendo que esta es una solicitud y aún no confirma mi pedido.",
  );
  return lines.join("\n");
}

export function buildCustomMessage({
  settings,
  customerName,
  kind,
  details,
  budget,
  productName,
  color,
  size,
  quantity,
  personalization,
  specialDetails,
  estimatedLeadTime,
}) {
  const structured = Boolean(productName);
  return [
    `Hola, ${settings.storeName || "Casa Hebra"} 👋`,
    `Soy ${customerName}. Quisiera cotizar una pieza personalizada.`,
    "",
    `Pieza base: ${productName || kind}`,
    structured && color ? `Color: ${color}` : "",
    structured && size ? `Tamaño: ${size}` : "",
    structured && quantity ? `Cantidad: ${quantity}` : "",
    structured && personalization ? `Nombre o frase: ${personalization}` : "",
    structured && specialDetails ? `Detalle especial: ${specialDetails}` : "",
    structured && estimatedLeadTime ? `Tiempo estimado: ${estimatedLeadTime}` : "",
    !structured ? `Idea: ${details}` : "",
    budget ? `Estimado base: ${budget}` : "",
    "",
    "¿Podemos confirmar los detalles, el precio final y las opciones de recogida?",
  ]
    .filter(Boolean)
    .join("\n");
}

export function categoryName(categories, categoryId) {
  return categories.find((category) => category.id === categoryId)?.name || "Crochet";
}
