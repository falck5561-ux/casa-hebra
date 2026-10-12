"use strict";

const { createApp } = require("../server/src/app");

let appPromise;

function getApp() {
  if (!appPromise) {
    appPromise = createApp({ production: true, serverless: true }).then(({ app }) => app);
  }
  return appPromise;
}

module.exports = async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error) {
    console.error(JSON.stringify({
      level: "fatal",
      message: "Casa Hebra API could not initialize on Vercel.",
      reason: error && error.message ? error.message : String(error),
    }));
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        error: "La API no pudo iniciar. Revisa las variables de entorno del deployment.",
        code: "API_INIT_FAILED",
      }));
    }
  }
};
