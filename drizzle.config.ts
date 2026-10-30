import { defineConfig } from "drizzle-kit";

// Generating SQL needs only the schema; credentials are consumed by migrate.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
});
