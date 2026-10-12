"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const serverRoot = path.resolve(__dirname, "..");
const mode = process.argv[2];
if (!new Set(["pure", "integration"]).has(mode)) {
  throw new Error("Use run-tests.js with pure or integration.");
}

if (mode === "integration") {
  for (const dependency of ["express", "multer"]) {
    try {
      require.resolve(dependency, { paths: [serverRoot] });
    } catch (error) {
      console.error(
        "Integration dependencies are missing. Run npm install before npm run test:integration.",
      );
      process.exit(1);
    }
  }
}

const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1"],
  {
    cwd: serverRoot,
    env: {
      ...process.env,
      CASA_HEBRA_TEST_MODE: mode,
    },
    stdio: "inherit",
  },
);
process.exit(result.status === null ? 1 : result.status);
