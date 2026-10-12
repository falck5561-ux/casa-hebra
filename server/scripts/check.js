"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const serverRoot = path.resolve(__dirname, "..");

function collectJavaScript(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScript(target);
    return entry.isFile() && entry.name.endsWith(".js") ? [target] : [];
  });
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(serverRoot, "package.json"), "utf8"),
);
if (!packageJson.scripts || !packageJson.scripts.start) {
  throw new Error("server/package.json is missing its start script.");
}

const files = [
  ...collectJavaScript(path.join(serverRoot, "src")),
  ...collectJavaScript(path.join(serverRoot, "scripts")),
  ...collectJavaScript(path.join(serverRoot, "test")),
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log("Server check passed (" + files.length + " JavaScript files).");
