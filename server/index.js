"use strict";

const path = require("node:path");
const { loadEnvFile } = require("./src/load-env");

// Local development can still use server/.env. Vercel injects its own variables.
loadEnvFile(path.join(__dirname, ".env"));

const { createApp } = require("./src/app");

let appPromise;

function getApp() {
  if (!appPromise) {
    appPromise = createApp({ production: true }).then(({ app }) => app);
  }
  return appPromise;
}

module.exports = async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
};
