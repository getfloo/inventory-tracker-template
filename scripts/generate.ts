import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("drizzle", { recursive: true });
const existing = new Set(readdirSync("drizzle"));
execFileSync("drizzle-kit", ["generate", ...process.argv.slice(2)], { stdio: "inherit" });

// Drizzle qualifies foreign keys with public; floo owns a schema per app/env.
// Normalize NEW SQL only so deployed migrations and their hashes never change.
for (const file of readdirSync("drizzle")) {
  if (file.endsWith(".sql") && !existing.has(file)) {
    const path = `drizzle/${file}`;
    writeFileSync(path, readFileSync(path, "utf8").replaceAll('"public".', ""));
  }
}
