"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdmin, getIdentity } from "@/lib/identity";
import {
  ItemInput, MovementInput, NewItemInput, UserError, actorFor, createItem, parse, recordMovement, updateItem,
} from "@/lib/inventory";

/**
 * What a form shows after it submits. `values` echoes the submitted fields on an
 * error, because React resets a form after its action runs.
 */
export type FormState = { error?: string; message?: string; values?: Record<string, string> };

const fieldValues = (formData: FormData) =>
  Object.fromEntries(Array.from(formData, ([key, value]) => [key, String(value)]));

// An empty or non-numeric field becomes undefined or NaN, which the schema rejects with its message.
const numberField = (formData: FormData, name: string) => {
  const raw = formData.get(name);
  return raw === null || raw === "" ? undefined : Number(raw);
};

function itemFields(formData: FormData) {
  return {
    sku: formData.get("sku"),
    name: formData.get("name"),
    location: formData.get("location"),
    unit: formData.get("unit"),
    reorderPoint: numberField(formData, "reorderPoint"),
  };
}

export async function recordMovementAction(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await getIdentity();
  const itemId = String(formData.get("itemId") ?? "");
  try {
    const input = parse(MovementInput, {
      kind: formData.get("kind"),
      quantity: numberField(formData, "quantity"),
      note: formData.get("note") ?? "",
    });
    const result = await recordMovement(itemId, input, actorFor(user));
    if (!result) return { error: "Choose an item.", values: fieldValues(formData) };
    const { item, movement } = result;
    revalidatePath("/");
    revalidatePath(`/items/${item.id}`);
    const change = movement.quantityChange > 0 ? `+${movement.quantityChange}` : String(movement.quantityChange);
    return { message: `Recorded ${change} ${item.unit} for ${item.sku}. ${item.quantityOnHand} on hand.` };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message, values: fieldValues(formData) };
    throw error;
  }
}

export async function createItemAction(_state: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdmin();
  let id: string;
  try {
    const input = parse(NewItemInput, { ...itemFields(formData), openingQuantity: numberField(formData, "openingQuantity") });
    id = (await createItem(input, actorFor(admin))).id;
  } catch (error) {
    if (error instanceof UserError) return { error: error.message, values: fieldValues(formData) };
    throw error;
  }
  revalidatePath("/");
  redirect(`/items/${id}`);
}

export async function updateItemAction(itemId: string, _state: FormState, formData: FormData): Promise<FormState> {
  await getAdmin();
  try {
    const item = await updateItem(itemId, parse(ItemInput, itemFields(formData)));
    if (!item) return { error: "This item no longer exists." };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message, values: fieldValues(formData) };
    throw error;
  }
  revalidatePath("/");
  revalidatePath(`/items/${itemId}`);
  redirect(`/items/${itemId}`);
}
