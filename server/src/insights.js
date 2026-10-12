"use strict";

const { randomUUID } = require("node:crypto");

const MAX_PRICE_HISTORY_RECORDS = 1_000;
const MAX_BOOTSTRAP_PRICE_HISTORY_RECORDS = 200;

function isFinitePrice(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizePriceHistory(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        typeof entry.id === "string" &&
        entry.id.length > 0 &&
        typeof entry.productId === "string" &&
        entry.productId.length > 0 &&
        typeof entry.productName === "string" &&
        entry.productName.length > 0 &&
        isFinitePrice(entry.previousPrice) &&
        isFinitePrice(entry.newPrice) &&
        entry.previousPrice !== entry.newPrice &&
        typeof entry.currency === "string" &&
        /^[A-Z]{3}$/.test(entry.currency) &&
        typeof entry.changedAt === "string" &&
        Number.isFinite(Date.parse(entry.changedAt)),
    )
    .slice(-MAX_PRICE_HISTORY_RECORDS)
    .map((entry) => ({
      id: entry.id,
      productId: entry.productId,
      productName: entry.productName,
      previousPrice: Math.round(entry.previousPrice * 100) / 100,
      newPrice: Math.round(entry.newPrice * 100) / 100,
      currency: entry.currency,
      changedAt: entry.changedAt,
    }));
}

function appendPriceChange(history, change) {
  const currentHistory = normalizePriceHistory(history);
  if (change.previousPrice === change.newPrice) return currentHistory;

  currentHistory.push({
    id: randomUUID(),
    productId: change.productId,
    productName: change.productName,
    previousPrice: Math.round(change.previousPrice * 100) / 100,
    newPrice: Math.round(change.newPrice * 100) / 100,
    currency: change.currency,
    changedAt: change.changedAt,
  });
  return currentHistory.slice(-MAX_PRICE_HISTORY_RECORDS);
}

function recentPriceHistory(history, limit = MAX_BOOTSTRAP_PRICE_HISTORY_RECORDS) {
  return normalizePriceHistory(history)
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    .slice(0, limit);
}

function buildAdminInsights(products, inquiries) {
  const productMap = new Map(
    (Array.isArray(products) ? products : []).map((product) => [
      product.id,
      product,
    ]),
  );
  const aggregates = new Map(
    [...productMap.values()].map((product) => [
      product.id,
      {
        productId: product.id,
        productName: product.name,
        inquiryCount: 0,
        unitsRequested: 0,
        lastConsultedAt: null,
      },
    ]),
  );

  let catalogueInquiries = 0;
  let customInquiries = 0;
  let totalRequestedUnits = 0;

  for (const inquiry of Array.isArray(inquiries) ? inquiries : []) {
    const items = Array.isArray(inquiry && inquiry.items) ? inquiry.items : [];
    const guidedCustomization = /^personalizaci(?:ó|o)n guiada\b/iu.test(
      String(inquiry && inquiry.note || "").trim(),
    );
    if (items.length > 0 && !guidedCustomization) catalogueInquiries += 1;
    else customInquiries += 1;

    const unitsByProduct = new Map();
    for (const item of items) {
      const quantity =
        Number.isInteger(item && item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 20
          ? item.quantity
          : 0;
      totalRequestedUnits += quantity;
      if (!productMap.has(item && item.productId) || quantity === 0) continue;
      unitsByProduct.set(
        item.productId,
        (unitsByProduct.get(item.productId) || 0) + quantity,
      );
    }

    for (const [productId, unitsRequested] of unitsByProduct) {
      const aggregate = aggregates.get(productId);
      aggregate.inquiryCount += 1;
      aggregate.unitsRequested += unitsRequested;
      if (
        typeof inquiry.createdAt === "string" &&
        (!aggregate.lastConsultedAt ||
          inquiry.createdAt > aggregate.lastConsultedAt)
      ) {
        aggregate.lastConsultedAt = inquiry.createdAt;
      }
    }
  }

  const productConsultations = [...aggregates.values()].sort(
    (a, b) =>
      b.inquiryCount - a.inquiryCount ||
      b.unitsRequested - a.unitsRequested ||
      a.productName.localeCompare(b.productName, "es"),
  );

  return {
    totalInquiries: catalogueInquiries + customInquiries,
    catalogueInquiries,
    customInquiries,
    totalRequestedUnits,
    productConsultations,
  };
}

module.exports = {
  MAX_BOOTSTRAP_PRICE_HISTORY_RECORDS,
  MAX_PRICE_HISTORY_RECORDS,
  appendPriceChange,
  buildAdminInsights,
  normalizePriceHistory,
  recentPriceHistory,
};
