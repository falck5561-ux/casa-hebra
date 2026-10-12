"use strict";

const path = require("node:path");
const dns = require("node:dns/promises");
const { loadEnvFile } = require("../src/load-env");
loadEnvFile(path.join(__dirname, "..", ".env"));

(async () => {
  const value = process.env.SUPABASE_URL;
  let url;
  try {
    url = new URL(value);
    if (url.protocol !== "https:") throw new Error("HTTPS requerido");
  } catch {
    console.error("SUPABASE_URL no es una URL HTTPS válida.");
    process.exitCode = 1;
    return;
  }
  console.log("Destino:", url.origin);
  console.log("Bucket:", process.env.SUPABASE_STORAGE_BUCKET || "casa-hebra-products");
  console.log("Clave configurada:", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
  try {
    const addresses = await dns.lookup(url.hostname, { all: true });
    console.log("DNS:", addresses.map((entry) => `IPv${entry.family}`).join(", "));
  } catch (error) {
    console.error("DNS ERROR:", error.code || error.message);
  }
  try {
    const response = await fetch(`${url.origin}/storage/v1/`, { signal: AbortSignal.timeout(12000) });
    console.log("Conexión HTTPS: OK; HTTP", response.status, "(401/404 también indican conexión exitosa)");
  } catch (error) {
    console.error("HTTPS ERROR:", error.cause?.code || error.name || error.message);
    console.error("Detalle:", error.cause?.message || error.message);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error("Diagnóstico fallido:", error.message);
  process.exitCode = 1;
});
