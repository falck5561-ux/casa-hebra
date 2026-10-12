"use strict";

const path = require("node:path");
const { loadEnvFile } = require("../src/load-env");
loadEnvFile(path.resolve(__dirname, "..", ".env"));
const { JsonStore } = require("../src/store");
const { SupabaseStore, databaseConfig } = require("../src/supabase-store");

async function main() {
  const config = databaseConfig({ ...process.env, SUPABASE_DATABASE_ENABLED: "true" });
  if (!config.configured) throw new Error("Falta la configuración de Supabase en server/.env.");
  const dataDir = process.env.DATA_DIR ? path.resolve(__dirname, "..", process.env.DATA_DIR) : path.resolve(__dirname, "..", "data");
  const local = await new JsonStore(dataDir).init();
  const snapshot = local.read();
  const remote = new SupabaseStore(config);
  remote.data = snapshot;
  await remote.persist(snapshot, true);
  console.log("Migración completada.");
  console.log(`Productos: ${snapshot.products.length}`);
  console.log(`Categorías: ${snapshot.categories.length}`);
  console.log(`Solicitudes: ${snapshot.inquiries.length}`);
  console.log(`Administrador configurado: ${Boolean(snapshot.auth && snapshot.auth.owner)}`);
}

main().catch((error) => {
  console.error("MIGRATION ERROR:", error.message);
  process.exitCode = 1;
});
