import { lte, sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// No "server-only" import here: scripts/low-stock.ts (the cron job) and scripts/seed.ts
// import this file directly.

/** People who have signed in, synced from the gateway on every page load. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// quantity_on_hand is the sum of the item's stock_movements.quantity_change. Only
// lib/inventory.ts writes it, in the same transaction that inserts the movement.
export const items = pgTable("items", {
  id: uuid("id").defaultRandom().primaryKey(),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  unit: text("unit").notNull(),
  quantityOnHand: integer("quantity_on_hand").default(0).notNull(),
  reorderPoint: integer("reorder_point").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("items_sku_idx").on(table.sku),
  check("items_quantity_on_hand_not_negative", sql`${table.quantityOnHand} >= 0`),
  check("items_reorder_point_not_negative", sql`${table.reorderPoint} >= 0`),
]);

/** An item is low on stock at or below its reorder point. The UI, API and cron job all use this. */
export const isLowStock = lte(items.quantityOnHand, items.reorderPoint);

// actor_id is whatever id the gateway asserted: a user's id from a page, or an API
// consumer's id from /api. It is not a foreign key to users because a key caller is
// not a user. actor_name keeps the label shown in history.
export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").defaultRandom().primaryKey(),
  itemId: uuid("item_id").notNull().references(() => items.id),
  kind: text("kind", { enum: ["in", "out", "adjustment"] }).notNull(),
  quantityChange: integer("quantity_change").notNull(),
  note: text("note").notNull(),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("stock_movements_item_id_created_at_idx").on(table.itemId, table.createdAt),
  check("stock_movements_kind_sign", sql`(${table.kind} = 'in' AND ${table.quantityChange} > 0)
    OR (${table.kind} = 'out' AND ${table.quantityChange} < 0)
    OR (${table.kind} = 'adjustment' AND ${table.quantityChange} <> 0)`),
]);

export type LowStockItem = { id: string; sku: string; name: string; quantityOnHand: number; reorderPoint: number; unit: string };

/** One row per run of the daily low-stock cron job (scripts/low-stock.ts). */
export const lowStockReports = pgTable("low_stock_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
  itemCount: integer("item_count").notNull(),
  items: jsonb("items").$type<LowStockItem[]>().notNull(),
}, (table) => [index("low_stock_reports_checked_at_idx").on(table.checkedAt)]);
