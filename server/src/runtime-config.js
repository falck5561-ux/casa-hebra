"use strict";

const MIN_SETUP_TOKEN_LENGTH = 16;
const RECOMMENDED_SETUP_TOKEN_LENGTH = 24;
const DEFAULT_INQUIRY_RETENTION_DAYS = 180;
const DEFAULT_MAX_INQUIRIES = 1_000;

function configuredOrigins(value) {
  const entries = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  return entries.map((entry) => String(entry).trim()).filter(Boolean);
}

function validatePublicOrigins(value, options = {}) {
  const origins = configuredOrigins(value);
  const normalized = [];

  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch (error) {
      throw new Error(
        "PUBLIC_ORIGIN must contain complete http(s) origins separated by commas.",
      );
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(
        "PUBLIC_ORIGIN entries must be origins only, without paths, credentials, queries or fragments.",
      );
    }
    if (options.production && parsed.protocol !== "https:") {
      throw new Error("PUBLIC_ORIGIN must use HTTPS in production.");
    }
    normalized.push(parsed.origin);
  }

  return [...new Set(normalized)];
}

function assertProductionOrigins(production, origins) {
  if (production && origins.length === 0) {
    throw new Error("PUBLIC_ORIGIN is required for every production start.");
  }
}

function resolveSetupPolicy(options = {}) {
  const production = Boolean(options.production);
  const hasOwner = Boolean(options.hasOwner);
  const supplied = options.setupToken;
  const configured =
    supplied !== undefined && supplied !== null && String(supplied) !== "";

  if (hasOwner) {
    return {
      setupToken: null,
      tokenConfigured: false,
    };
  }

  if (!configured) {
    if (production) {
      throw new Error(
        "SETUP_TOKEN is required before the first production start (minimum 16 characters; generate at least 24 random bytes).",
      );
    }
    return {
      setupToken: null,
      tokenConfigured: false,
    };
  }

  if (typeof supplied !== "string") {
    throw new Error("SETUP_TOKEN must be a string.");
  }
  if (
    supplied !== supplied.trim() ||
    supplied.length < MIN_SETUP_TOKEN_LENGTH ||
    supplied.length > 512
  ) {
    throw new Error(
      "SETUP_TOKEN must contain 16 to 512 characters without surrounding whitespace; 24+ random bytes are recommended.",
    );
  }

  return {
    setupToken: supplied,
    tokenConfigured: true,
  };
}

function parseBoundedInteger(name, value, fallback, minimum, maximum) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = typeof value === "string" ? value.trim() : value;
  const parsed =
    typeof normalized === "number" ? normalized : Number(normalized);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new Error(
      name +
        " must be an integer between " +
        minimum +
        " and " +
        maximum +
        ".",
    );
  }
  return parsed;
}

function parsePort(value) {
  const raw = value === undefined || value === "" ? "8787" : value;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    throw new Error("PORT must contain digits only.");
  }
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function resolveInquiryPolicy(options = {}) {
  return {
    retentionDays: parseBoundedInteger(
      "INQUIRY_RETENTION_DAYS",
      options.retentionDays,
      DEFAULT_INQUIRY_RETENTION_DAYS,
      1,
      180,
    ),
    maxInquiries: parseBoundedInteger(
      "MAX_INQUIRIES",
      options.maxInquiries,
      DEFAULT_MAX_INQUIRIES,
      1,
      5_000,
    ),
  };
}

module.exports = {
  DEFAULT_INQUIRY_RETENTION_DAYS,
  DEFAULT_MAX_INQUIRIES,
  MIN_SETUP_TOKEN_LENGTH,
  RECOMMENDED_SETUP_TOKEN_LENGTH,
  assertProductionOrigins,
  configuredOrigins,
  parsePort,
  resolveInquiryPolicy,
  resolveSetupPolicy,
  validatePublicOrigins,
};
