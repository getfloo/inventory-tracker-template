import "server-only";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { isLowStock, items, lowStockReports, stockMovements } from "@/db/schema";
import type { Caller } from "@/lib/identity";

// One schema per input validates the forms in app/actions.ts and the /api routes, and
// the OpenAPI document is generated from it, so the three cannot drift.

const MAX_QUANTITY = 1_000_000;
const text = (label: string, max: number) =>
  z.string({ error: `${label} is required.` })
    .trim()
    .min(1, { error: `${label} is required.` })
    .max(max, { error: `${label} must be at most ${max} characters.` });
const count = (label: string) =>
  z.number({ error: `${label} must be a whole number.` })
    .int({ error: `${label} must be a whole number.` })
    .min(0, { error: `${label} cannot be negative.` })
    .max(MAX_QUANTITY, { error: `${label} must be at most ${MAX_QUANTITY.toLocaleString("en-US")}.` });

export const ItemInput = z.object({
  sku: text("SKU", 64).meta({ description: "Unique stock-keeping code, for example WH-0042." }),
  name: text("Name", 200),
  location: text("Location", 100).meta({ description: "Where the item is kept, for example Aisle 3, Bin B." }),
  unit: text("Unit", 20).meta({ description: "What one counts as: each, box, kg, roll." }),
  reorderPoint: count("Reorder point").meta({ description: "The item is low on stock at or below this quantity." }),
});

export const ListItemsQuery = z.object({
  q: z.string().trim().max(100, { error: "Search at most 100 characters." }).optional()
    .meta({ description: "Matches SKU, name or location, ignoring case." }),
  low: z.enum(["true", "false"], { error: "low must be true or false." })
    .meta({ description: "true returns only items at or below their reorder point." })
    .transform((value) => value === "true").optional(),
});

export const NewItemInput = ItemInput.extend({
  openingQuantity: count("Opening quantity").default(0)
    .meta({ description: "Recorded as the item's first stock movement." }),
});

export const MOVEMENT_KINDS = ["in", "out", "adjustment"] as const;

export const MovementInput = z.object({
  kind: z.enum(MOVEMENT_KINDS, { error: "Choose in, out or adjustment." })
    .meta({ description: "in adds stock, out removes it, adjustment corrects a count in either direction." }),
  quantity: z.number({ error: "Quantity must be a whole number." })
    .int({ error: "Quantity must be a whole number." })
    .min(-MAX_QUANTITY, { error: "Quantity is too large." })
    .max(MAX_QUANTITY, { error: "Quantity is too large." })
    .meta({ description: "For in and out, how many units (positive). For adjustment, the signed change, for example -2." }),
  note: z.string().trim().max(500, { error: "Note must be at most 500 characters." }).default("")
    .meta({ description: "Why the stock moved: a PO number, a job, a recount." }),
});

/** A problem the caller can fix. Forms show its message; the API returns it as `error`. */
export class UserError extends Error {}
/** Invalid input; the API answers it with 400. */
export class InvalidInput extends UserError {}
/** The movement would take stock below zero; the API answers it with 409. */
export class InsufficientStock extends UserError {}
/** The SKU belongs to another item. */
export class DuplicateSku extends UserError {}

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidInput(parsed.error.issues[0].message);
  }
  return parsed.data;
}

/** The signed change a movement makes to quantity on hand. */
export function quantityChange({ kind, quantity }: Pick<z.infer<typeof MovementInput>, "kind" | "quantity">): number {
  if (kind === "adjustment") {
    if (quantity === 0) throw new InvalidInput("An adjustment must change the quantity.");
    return quantity;
  }
  if (quantity < 1) throw new InvalidInput(`Quantity ${kind} must be at least 1.`);
  return kind === "in" ? quantity : -quantity;
}

export type Item = typeof items.$inferSelect;
export type Movement = typeof stockMovements.$inferSelect;
export type LowStockReport = typeof lowStockReports.$inferSelect;

/** Mirrors isLowStock in db/schema.ts, for rows already loaded. */
export const isLow = (item: Pick<Item, "quantityOnHand" | "reorderPoint">) => item.quantityOnHand <= item.reorderPoint;

type Actor = { id: string; name: string };
const isUuid = (id: string) => z.uuid().safeParse(id).success;
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Who to record on a movement: the signed-in person, or the API consumer holding the key. */
export function actorFor(caller: Caller): Actor {
  return caller.kind === "user"
    ? { id: caller.id, name: caller.name || caller.email }
    : { id: caller.id, name: caller.name || "API key" };
}

export async function listItems({ q, lowOnly }: { q?: string; lowOnly?: boolean }): Promise<Item[]> {
  const search = q ? `%${q}%` : undefined;
  return getDb().select().from(items).where(and(
    search ? or(ilike(items.sku, search), ilike(items.name, search), ilike(items.location, search)) : undefined,
    lowOnly ? isLowStock : undefined,
  )).orderBy(asc(items.name));
}

export async function getItem(id: string): Promise<Item | undefined> {
  if (!isUuid(id)) return undefined;
  const [item] = await getDb().select().from(items).where(eq(items.id, id));
  return item;
}

export async function listMovements(itemId: string, limit: number): Promise<Movement[]> {
  return getDb().select().from(stockMovements).where(eq(stockMovements.itemId, itemId))
    .orderBy(desc(stockMovements.createdAt)).limit(limit);
}

export async function latestLowStockReport(): Promise<LowStockReport | undefined> {
  const [report] = await getDb().select().from(lowStockReports).orderBy(desc(lowStockReports.checkedAt)).limit(1);
  return report;
}

// The only writer of items.quantity_on_hand. The item row is locked, so concurrent
// movements on one item apply one after another and the total always equals the sum
// of its movements. Any throw rolls the whole transaction back.
async function applyMovement(tx: Transaction, itemId: string, input: z.infer<typeof MovementInput>, actor: Actor) {
  const change = quantityChange(input);
  const [item] = await tx.select().from(items).where(eq(items.id, itemId)).for("update");
  if (!item) return undefined;
  const quantityOnHand = item.quantityOnHand + change;
  if (quantityOnHand < 0) {
    throw new InsufficientStock(`Only ${item.quantityOnHand} ${item.unit} of ${item.sku} on hand.`);
  }
  const [movement] = await tx.insert(stockMovements).values({
    itemId, kind: input.kind, quantityChange: change, note: input.note, actorId: actor.id, actorName: actor.name,
  }).returning();
  const [updated] = await tx.update(items).set({ quantityOnHand, updatedAt: new Date() })
    .where(eq(items.id, itemId)).returning();
  return { item: updated, movement };
}

/** Records a movement and updates quantity on hand together. Undefined when the item does not exist. */
export async function recordMovement(itemId: string, input: z.infer<typeof MovementInput>, actor: Actor) {
  if (!isUuid(itemId)) return undefined;
  return getDb().transaction((tx) => applyMovement(tx, itemId, input, actor));
}

// Postgres reports a unique violation as 23505; drizzle wraps the driver error in `cause`.
function isDuplicateSku(error: unknown): boolean {
  const cause = error instanceof Error && error.cause ? error.cause : error;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

const duplicateSku = (sku: string) => new DuplicateSku(`Another item already uses SKU ${sku}.`);

export async function createItem(input: z.infer<typeof NewItemInput>, actor: Actor): Promise<Item> {
  const { openingQuantity, ...fields } = input;
  return getDb().transaction(async (tx) => {
    const [item] = await tx.insert(items).values(fields).onConflictDoNothing({ target: items.sku }).returning();
    if (!item) throw duplicateSku(fields.sku);
    if (openingQuantity === 0) return item;
    const opened = await applyMovement(tx, item.id, { kind: "in", quantity: openingQuantity, note: "Opening stock" }, actor);
    return opened!.item;
  });
}

/** Edits an item's details. Quantity on hand changes only through movements. */
export async function updateItem(id: string, input: z.infer<typeof ItemInput>): Promise<Item | undefined> {
  if (!isUuid(id)) return undefined;
  try {
    const [item] = await getDb().update(items).set({ ...input, updatedAt: new Date() }).where(eq(items.id, id)).returning();
    return item;
  } catch (error) {
    if (isDuplicateSku(error)) throw duplicateSku(input.sku);
    throw error;
  }
}
