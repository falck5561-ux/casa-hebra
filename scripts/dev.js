"use strict";

const { spawn } = require("node:child_process");

const npmCli = process.env.npm_execpath;
const nodeCommand = process.env.npm_node_execpath || process.execPath;

function runWorkspace(workspace) {
  if (npmCli) {
    return spawn(
      nodeCommand,
      [npmCli, "run", "dev", "--workspace", workspace],
      {
        stdio: "inherit",
        env: process.env,
      },
    );
  }

  const isWindows = process.platform === "win32";
  return spawn(
    isWindows ? process.env.ComSpec || "cmd.exe" : "npm",
    isWindows
      ? ["/d", "/s", "/c", `npm.cmd run dev --workspace ${workspace}`]
      : ["run", "dev", "--workspace", workspace],
    {
      stdio: "inherit",
      env: process.env,
    },
  );
}

const children = [
  runWorkspace("server"),
  runWorkspace("client"),
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 750);
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) stop(code === 0 && !signal ? 0 : code || 1);
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
