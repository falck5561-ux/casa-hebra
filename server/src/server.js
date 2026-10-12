"use strict";

const http = require("node:http");
const path = require("node:path");
const { loadEnvFile } = require("./load-env");

loadEnvFile(path.join(__dirname, "..", ".env"));

const { createApp } = require("./app");
const { parsePort } = require("./runtime-config");

async function main() {
  const port = parsePort(process.env.PORT);

  const { app, config, store } = await createApp();
  const server = http.createServer(app);
  const host = config.production ? "0.0.0.0" : "127.0.0.1";

  server.listen(port, host, () => {
    console.log(
      JSON.stringify({
        level: "info",
        message: "Casa Hebra server is ready.",
        host,
        port,
        dataDir: config.dataDir,
        clientDist: config.clientDist,
      }),
    );
  });

  const shutdown = (signal) => {
    console.log(
      JSON.stringify({
        level: "info",
        message: "Graceful shutdown started.",
        signal,
      }),
    );
    server.close(async (error) => {
      try {
        await store.flush();
      } finally {
        process.exit(error ? 1 : 0);
      }
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      message: error.message,
    }),
  );
  process.exit(1);
});
