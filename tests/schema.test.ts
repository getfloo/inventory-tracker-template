import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { describe, expect, it } from "vitest";

describe("committed migrations", () => {
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  const sql = migrations.flatMap((migration) => migration.sql).join("\n");
  const tables = new Map(Array.from(
    sql.matchAll(/CREATE TABLE "(\w+)"\s*\(([\s\S]*?)\n\);/g),
    ([, name, columns]) => [name, columns],
  ));

  it("creates users with the gateway ID and profile fields", () => {
    expect(tables.get("users")).toMatch(/"id" text PRIMARY KEY NOT NULL/);
    for (const column of ["email", "name", "role", "created_at", "updated_at"]) {
      expect(tables.get("users")).toContain(`"${column}"`);
    }
  });

  it("creates items with a unique SKU and a quantity that cannot go negative", () => {
    expect(tables.get("items")).toContain('"quantity_on_hand" integer DEFAULT 0 NOT NULL');
    expect(tables.get("items")).toContain('"reorder_point" integer NOT NULL');
    expect(tables.get("items")).toMatch(/CHECK \("items"\."quantity_on_hand" >= 0\)/);
    expect(sql).toContain('CREATE UNIQUE INDEX "items_sku_idx" ON "items" USING btree ("sku")');
  });

  it("creates stock movements whose sign must match their kind", () => {
    const movements = tables.get("stock_movements");
    for (const column of ["item_id", "kind", "quantity_change", "note", "actor_id", "actor_name", "created_at"]) {
      expect(movements).toContain(`"${column}"`);
    }
    expect(movements).toContain("CONSTRAINT \"stock_movements_kind_sign\" CHECK");
    expect(sql).toMatch(/FOREIGN KEY \("item_id"\) REFERENCES "items"\("id"\)/);
    expect(sql).toContain('ON "stock_movements" USING btree ("item_id","created_at")');
  });

  it("creates low-stock reports for the cron job", () => {
    expect(tables.get("low_stock_reports")).toContain('"items" jsonb NOT NULL');
    expect(tables.get("low_stock_reports")).toContain('"item_count" integer NOT NULL');
  });

  it("keeps SQL portable across managed tenant schemas", () => {
    expect(sql).not.toMatch(/"public"\.|CREATE SCHEMA|SET search_path/i);
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    expect(journal.entries).toHaveLength(migrations.length);
    expect(migrations.length).toBeGreaterThan(0);
  });
});
