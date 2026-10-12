"use strict";

const fs = require("node:fs");

function unquote(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    const quote = value[0];
    const inner = value.slice(1, -1);
    if (quote === "'") return inner;
    return inner.replace(/\\([nrt"\\])/g, (match, character) => {
      const replacements = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" };
      return replacements[character];
    });
  }
  return value.replace(/\s+#.*$/, "").trim();
}

function loadEnvFile(filePath) {
  let source;
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > 64 * 1024) {
      throw new Error(".env is unexpectedly large.");
    }
    source = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }

  for (const rawLine of source.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const assignment = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = assignment.indexOf("=");
    if (separator < 1) continue;
    const key = assignment.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    process.env[key] = unquote(assignment.slice(separator + 1).trim());
  }
  return true;
}

module.exports = {
  loadEnvFile,
};
