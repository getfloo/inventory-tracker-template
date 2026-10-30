import { z } from "zod";
import { type Item, ListItemsQuery, MOVEMENT_KINDS, MovementInput, isLow } from "@/lib/inventory";
import { ApiError, type Operation } from "@/lib/openapi";

/** An item as the API returns it. */
export const ItemJson = z.object({
  id: z.uuid(),
  sku: z.string(),
  name: z.string(),
  location: z.string(),
  unit: z.string(),
  quantityOnHand: z.int().meta({ description: "Always the sum of the item's movements." }),
  reorderPoint: z.int(),
  lowStock: z.boolean().meta({ description: "True when quantityOnHand is at or below reorderPoint." }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const itemJson = (item: Item) => ({ ...item, lowStock: isLow(item) });

/** A stock movement as the API returns it. */
export const MovementJson = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  kind: z.enum(MOVEMENT_KINDS),
  quantityChange: z.int().meta({ description: "Signed change to quantity on hand: positive adds, negative removes." }),
  note: z.string(),
  actorId: z.string().meta({ description: "The user or API consumer that recorded the movement." }),
  actorName: z.string(),
  createdAt: z.iso.datetime(),
});

const ItemPath = z.object({ id: z.uuid().meta({ description: "The item's id, from listItems." }) });
const notFound = { description: "No item has this id.", schema: ApiError };

export const RECENT_MOVEMENTS = 20;

// The contract for ./route.ts, ./[id]/route.ts and ./[id]/movements/route.ts. Listed in
// app/api/operations.ts; the tests fail if a handler is missing here or a response
// stops matching.
export const operations: Operation[] = [
  {
    method: "get",
    path: "/api/items",
    operationId: "listItems",
    summary: "List items by name. Pass low=true for items at or below their reorder point.",
    query: ListItemsQuery,
    responses: {
      200: { description: "The matching items.", schema: z.object({ items: z.array(ItemJson) }) },
      400: { description: "A query parameter is invalid.", schema: ApiError },
    },
  },
  {
    method: "get",
    path: "/api/items/{id}",
    operationId: "getItem",
    summary: `Get an item with its ${RECENT_MOVEMENTS} most recent movements, newest first.`,
    params: ItemPath,
    responses: {
      200: {
        description: "The item and its recent movements.",
        schema: z.object({ item: ItemJson, movements: z.array(MovementJson) }),
      },
      404: notFound,
    },
  },
  {
    method: "post",
    path: "/api/items/{id}/movements",
    operationId: "recordMovement",
    summary: "Record stock in, out, or an adjustment. Quantity on hand changes in the same transaction.",
    params: ItemPath,
    request: MovementInput,
    responses: {
      201: { description: "The movement and the updated item.", schema: z.object({ movement: MovementJson, item: ItemJson }) },
      400: { description: "The body is not JSON or a field is invalid.", schema: ApiError },
      404: notFound,
      409: { description: "The movement would take quantity on hand below zero.", schema: ApiError },
    },
  },
];
