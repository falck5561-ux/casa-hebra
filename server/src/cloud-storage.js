"use strict";

const { randomUUID } = require("node:crypto");
const { HttpError } = require("./errors");
const { inspectImage } = require("./uploads");

function trimSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function storageConfig(env = process.env) {
  const url = trimSlash(env.SUPABASE_URL);
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const bucket = String(env.SUPABASE_STORAGE_BUCKET || "casa-hebra-products").trim();
  const configured = Boolean(url && serviceRoleKey && bucket);
  return { url, serviceRoleKey, bucket, configured };
}

function connectionFailure(error) {
  const cause = error && error.cause;
  const code = String((cause && cause.code) || error.code || "NETWORK_ERROR");
  const known = {
    ENOTFOUND: "No se pudo encontrar el dominio de Supabase. Revisa SUPABASE_URL y tu DNS.",
    EAI_AGAIN: "El DNS no respondió. Comprueba tu conexión y vuelve a intentar.",
    ETIMEDOUT: "La conexión con Supabase agotó el tiempo de espera.",
    UND_ERR_CONNECT_TIMEOUT: "No fue posible conectar con Supabase a tiempo.",
    ECONNREFUSED: "El servidor remoto rechazó la conexión.",
    ECONNRESET: "La conexión con Supabase se interrumpió.",
    CERT_HAS_EXPIRED: "El certificado TLS de la conexión ha caducado.",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "Node no pudo verificar el certificado TLS (revisa antivirus o proxy HTTPS).",
    SELF_SIGNED_CERT_IN_CHAIN: "Node detectó un certificado TLS no confiable (revisa antivirus o proxy HTTPS).",
  };
  const detail = known[code] || "Node no pudo establecer la conexión HTTPS con Supabase. Revisa DNS, proxy, firewall o certificados.";
  return new HttpError(503, "CLOUD_CONNECTION_FAILED", `${detail} (código: ${code}).`);
}

async function storageRequest(endpoint, options) {
  try {
    return await fetch(endpoint, { ...options, signal: AbortSignal.timeout(20000) });
  } catch (error) {
    if (error && error.name === "TimeoutError") {
      throw new HttpError(503, "CLOUD_CONNECTION_TIMEOUT", "Supabase no respondió en 20 segundos.");
    }
    throw connectionFailure(error);
  }
}

function encodeObjectPath(objectPath) {
  return objectPath.split("/").map(encodeURIComponent).join("/");
}

function publicObjectUrl(config, objectPath) {
  return `${config.url}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${encodeObjectPath(objectPath)}`;
}

function isConfiguredStorageUrl(value, config = storageConfig()) {
  if (!config.configured || typeof value !== "string") return false;
  try {
    const candidate = new URL(value);
    const base = new URL(config.url);
    const prefix = `/storage/v1/object/public/${encodeURIComponent(config.bucket)}/`;
    return candidate.protocol === "https:" && candidate.origin === base.origin && candidate.pathname.startsWith(prefix);
  } catch {
    return false;
  }
}

async function uploadImagesToSupabase(files, config = storageConfig()) {
  if (!config.configured) {
    throw new HttpError(503, "CLOUD_STORAGE_NOT_CONFIGURED", "El almacenamiento en la nube todavía no está configurado.");
  }
  if (!Array.isArray(files) || files.length === 0) {
    throw new HttpError(400, "IMAGES_REQUIRED", "Selecciona al menos una imagen.");
  }

  const created = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const metadata = inspectImage(files[index], index);
      const objectPath = `products/${new Date().getUTCFullYear()}/${randomUUID()}.${metadata.extension}`;
      const endpoint = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeObjectPath(objectPath)}`;
      const response = await storageRequest(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.serviceRoleKey}`,
          apikey: config.serviceRoleKey,
          "Content-Type": metadata.mime,
          "Cache-Control": "31536000",
          "x-upsert": "false",
        },
        body: metadata.safeBuffer,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new HttpError(502, "CLOUD_UPLOAD_FAILED", `Supabase Storage rechazó la foto ${index + 1}.${detail ? ` ${detail.slice(0, 180)}` : ""}`);
      }
      created.push({
        objectPath,
        url: publicObjectUrl(config, objectPath),
        width: metadata.width,
        height: metadata.height,
        mimeType: metadata.mime,
        storage: "supabase",
      });
    }
    return created;
  } catch (error) {
    await Promise.all(created.map((item) => deleteSupabaseObject(item.objectPath, config).catch(() => undefined)));
    throw error;
  }
}

async function deleteSupabaseObject(objectPath, config = storageConfig()) {
  if (!config.configured || !objectPath) return false;
  const endpoint = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeObjectPath(objectPath)}`;
  const response = await storageRequest(endpoint, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${config.serviceRoleKey}`, apikey: config.serviceRoleKey },
  });
  return response.ok || response.status === 404;
}

module.exports = { isConfiguredStorageUrl, storageConfig, uploadImagesToSupabase, connectionFailure };
