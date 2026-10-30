import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseGlobal = globalThis as typeof globalThis & {
  flooDatabase?: ReturnType<typeof createDatabase>;
};

function createDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL. Run floo dev or deploy with managed Postgres.");
  }
  return drizzle(postgres(url, { max: 5, idle_timeout: 20 }), { schema });
}

// Lazy initialization keeps builds credential-free; reuse the pool on hot reload.
export function getDb() {
  return databaseGlobal.flooDatabase ??= createDatabase();
}
