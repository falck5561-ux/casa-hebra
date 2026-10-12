"use strict";

const crypto = require("node:crypto");
const { HttpError } = require("./errors");

const SESSION_COOKIE = "casa_hebra_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      SCRYPT_OPTIONS,
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scryptAsync(password, salt);
  return [
    "scrypt",
    String(SCRYPT_OPTIONS.N),
    String(SCRYPT_OPTIONS.r),
    String(SCRYPT_OPTIONS.p),
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

async function verifyPassword(password, encoded) {
  const parts = typeof encoded === "string" ? encoded.split("$") : [];
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [algorithm, rawN, rawR, rawP, rawSalt, rawExpected] = parts;
  void algorithm;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (N !== SCRYPT_OPTIONS.N || r !== SCRYPT_OPTIONS.r || p !== SCRYPT_OPTIONS.p) {
    return false;
  }

  try {
    const salt = Buffer.from(rawSalt, "base64url");
    const expected = Buffer.from(rawExpected, "base64url");
    if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;
    const actual = await scryptAsync(password, salt);
    return crypto.timingSafeEqual(actual, expected);
  } catch (error) {
    return false;
  }
}

function parseCookies(header) {
  const result = {};
  if (typeof header !== "string" || header.length > 8192) return result;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      result[name] = decodeURIComponent(value);
    } catch (error) {
      result[name] = value;
    }
  }
  return result;
}

function sessionCookie(token, production) {
  const attributes = [
    SESSION_COOKIE + "=" + encodeURIComponent(token),
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + Math.floor(SESSION_TTL_MS / 1000),
  ];
  if (production) attributes.push("Secure");
  return attributes.join("; ");
}

function expiredSessionCookie(production) {
  const attributes = [
    SESSION_COOKIE + "=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (production) attributes.push("Secure");
  return attributes.join("; ");
}

function createSession(ownerId, now = Date.now()) {
  const token = randomToken();
  return {
    token,
    record: {
      id: crypto.randomUUID(),
      ownerId,
      tokenHash: hashSessionToken(token),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    },
  };
}

function removeExpiredSessions(sessions, now = Date.now()) {
  return sessions.filter((session) => {
    const expiresAt = Date.parse(session.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
}

function safeTokenMatches(actualHash, expectedHash) {
  if (
    typeof actualHash !== "string" ||
    typeof expectedHash !== "string" ||
    actualHash.length !== expectedHash.length
  ) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(actualHash, "utf8"),
    Buffer.from(expectedHash, "utf8"),
  );
}

function safeSecretMatches(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  const actualDigest = crypto.createHash("sha256").update(actual).digest();
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(actualDigest, expectedDigest);
}

function isLoopbackAddress(value) {
  if (typeof value !== "string") return false;
  const address = value.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (address === "::1" || address === "localhost") return true;
  const ipv4 = address.startsWith("::ffff:") ? address.slice(7) : address;
  const parts = ipv4.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255) &&
    Number(parts[0]) === 127
  );
}

function headerValue(req, name) {
  if (req && typeof req.get === "function") return req.get(name);
  return req && req.headers ? req.headers[name.toLowerCase()] : undefined;
}

function loopbackHostnameFromHost(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const hostname = new URL("http://" + value.trim()).hostname;
    return isLoopbackAddress(hostname);
  } catch (error) {
    return false;
  }
}

function loopbackHostnameFromUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      isLoopbackAddress(parsed.hostname)
    );
  } catch (error) {
    return false;
  }
}

function isLoopbackRequest(req) {
  const addresses = [req.ip, req.socket && req.socket.remoteAddress].filter(
    Boolean,
  );
  if (
    addresses.length === 0 ||
    addresses.some((address) => !isLoopbackAddress(address))
  ) {
    return false;
  }
  if (!loopbackHostnameFromHost(headerValue(req, "host"))) return false;

  const originOrReferer =
    headerValue(req, "origin") || headerValue(req, "referer");
  return !originOrReferer || loopbackHostnameFromUrl(originOrReferer);
}

function getSession(req, data) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token || token.length > 256) return null;

  const tokenHash = hashSessionToken(token);
  const now = Date.now();
  const session = data.auth.sessions.find(
    (candidate) =>
      Date.parse(candidate.expiresAt) > now &&
      safeTokenMatches(candidate.tokenHash, tokenHash),
  );
  if (!session || !data.auth.owner || session.ownerId !== data.auth.owner.id) {
    return null;
  }
  return session;
}

function publicOwner(owner) {
  if (!owner) return null;
  return {
    id: owner.id,
    email: owner.email,
    role: "owner",
    createdAt: owner.createdAt,
  };
}

function requireAdmin(store, options = {}) {
  const production =
    options.production !== undefined
      ? Boolean(options.production)
      : process.env.NODE_ENV === "production";
  return (req, res, next) => {
    const data = store.readSections(["auth"]);
    const session = getSession(req, data);
    if (!session) {
      res.setHeader(
        "Set-Cookie",
        expiredSessionCookie(production),
      );
      return next(
        new HttpError(
          401,
          "AUTH_REQUIRED",
          "Inicia sesión para continuar.",
        ),
      );
    }

    req.admin = publicOwner(data.auth.owner);
    req.sessionId = session.id;
    return next();
  };
}

function normalizeOrigin(value) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.origin;
  } catch (error) {
    return null;
  }
}

function sameOrigin(options = {}) {
  const configuredOrigins = new Set(
    (options.allowedOrigins || [])
      .map(normalizeOrigin)
      .filter(Boolean),
  );

  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

    const fetchSite = req.get("sec-fetch-site");
    if (fetchSite === "cross-site") {
      return next(
        new HttpError(
          403,
          "CROSS_SITE_REQUEST",
          "La solicitud no proviene de este sitio.",
        ),
      );
    }

    const supplied = req.get("origin");
    const referer = req.get("referer");
    const candidate = supplied || referer;
    if (!candidate) {
      if (options.requireOrigin) {
        return next(
          new HttpError(
            403,
            "ORIGIN_REQUIRED",
            "No fue posible verificar el origen de la solicitud.",
          ),
        );
      }
      return next();
    }

    const candidateOrigin = normalizeOrigin(candidate);
    const host = req.get("host");
    const inferredOrigin = host ? normalizeOrigin(req.protocol + "://" + host) : null;
    const valid =
      candidateOrigin &&
      (configuredOrigins.has(candidateOrigin) ||
        (options.allowInferredOrigin !== false &&
          inferredOrigin &&
          candidateOrigin === inferredOrigin));

    if (!valid) {
      return next(
        new HttpError(
          403,
          "ORIGIN_MISMATCH",
          "La solicitud no proviene de este sitio.",
        ),
      );
    }
    return next();
  };
}

function rateLimit(options) {
  const windowMs = options.windowMs;
  const limit = options.limit;
  const maxBuckets = options.maxBuckets || 5_000;
  const buckets = new Map();
  let requestCount = 0;

  function pruneExpired(now) {
    for (const [bucketKey, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  return (req, res, next) => {
    const now = Date.now();
    const identity =
      typeof options.keyGenerator === "function"
        ? String(options.keyGenerator(req))
        : req.ip ||
          (req.socket && req.socket.remoteAddress
            ? req.socket.remoteAddress
            : "unknown");
    const key =
      identity +
      ":" +
      (options.keyPrefix || "request");
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      requestCount += 1;
      if (requestCount % 128 === 0 || buckets.size >= maxBuckets) {
        pruneExpired(now);
      }
      if (buckets.size >= maxBuckets && !buckets.has(key)) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey !== undefined) buckets.delete(oldestKey);
      }
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, limit - bucket.count);
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader(
      "RateLimit-Reset",
      String(Math.ceil(bucket.resetAt / 1000)),
    );

    if (bucket.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return next(
        new HttpError(
          429,
          "RATE_LIMITED",
          "Demasiados intentos. Espera un momento y vuelve a intentar.",
        ),
      );
    }

    return next();
  };
}

function storageImageOrigin() {
  try {
    const url = new URL(process.env.SUPABASE_URL || "");
    return url.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${storageImageOrigin() ? ` ${storageImageOrigin()}` : ""}`,
      "font-src 'self' data:",
      "connect-src 'self'",
    ].join("; "),
  );
  next();
}

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  expiredSessionCookie,
  getSession,
  hashPassword,
  hashSessionToken,
  isLoopbackAddress,
  isLoopbackRequest,
  publicOwner,
  rateLimit,
  removeExpiredSessions,
  requireAdmin,
  sameOrigin,
  safeSecretMatches,
  securityHeaders,
  sessionCookie,
  verifyPassword,
};
