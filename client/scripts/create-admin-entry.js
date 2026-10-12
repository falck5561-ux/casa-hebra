import { copyFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, "..");
const distDir = path.join(clientRoot, "dist");
const source = path.join(distDir, "index.html");
const adminDir = path.join(distDir, "admin");
const target = path.join(adminDir, "index.html");

await access(source);
await mkdir(adminDir, { recursive: true });
await copyFile(source, target);
console.log("Created physical Vercel admin entry: dist/admin/index.html");
