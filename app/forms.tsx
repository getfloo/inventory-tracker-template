"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type ItemOption = { id: string; sku: string; name: string; unit: string };
type ItemValues = { sku: string; name: string; location: string; unit: string; reorderPoint: number };

const label = "mb-1.5 block text-sm font-medium";
const button = "cursor-pointer rounded-sm bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60";

function Status({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>;
  if (state.message) return <p role="status" className="rounded-sm bg-success-soft px-3 py-2 text-sm text-success">{state.message}</p>;
  return null;
}

/** Records stock in, out or an adjustment. Pass `items` to choose the item, or `item` to fix it. */
export function MovementForm({ action, items, item }: { action: Action; items?: ItemOption[]; item?: ItemOption }) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? {};
  return (
    <form action={formAction} className="space-y-4">
      {item ? (
        <input type="hidden" name="itemId" value={item.id} />
      ) : (
        <div>
          <label htmlFor="itemId" className={label}>Item</label>
          <select id="itemId" name="itemId" required defaultValue={values.itemId ?? ""} className="w-full">
            <option value="" disabled>Choose an item</option>
            {items?.map((option) => (
              <option key={option.id} value={option.id}>{option.sku} · {option.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="kind" className={label}>Movement</label>
          <select id="kind" name="kind" defaultValue={values.kind ?? "out"} className="w-full">
            <option value="in">In</option>
            <option value="out">Out</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </div>
        <div>
          <label htmlFor="quantity" className={label}>Quantity{item ? ` (${item.unit})` : ""}</label>
          <input id="quantity" name="quantity" type="number" step={1} required inputMode="numeric"
            defaultValue={values.quantity ?? ""} className="w-full" />
        </div>
      </div>
      <p className="text-xs text-muted">In: received. Out: used or shipped. Adjustment: a recount, entered as the change (-2 removes two).</p>
      <div>
        <label htmlFor="note" className={label}>Note <span className="font-normal text-muted">(optional)</span></label>
        <input id="note" name="note" maxLength={500} defaultValue={values.note ?? ""}
          placeholder="PO-1182, job 47, cycle count" className="w-full placeholder:text-muted" />
      </div>
      <Status state={state} />
      <button type="submit" disabled={pending} className={button}>{pending ? "Recording…" : "Record movement"}</button>
    </form>
  );
}

/** Creates an item (with an opening quantity) or edits one's details. */
export function ItemForm({ action, item }: { action: Action; item?: ItemValues }) {
  const [state, formAction, pending] = useActionState(action, {});
  const values: Record<string, string> = state.values
    ?? (item ? { ...item, reorderPoint: String(item.reorderPoint) } : { reorderPoint: "0", openingQuantity: "0" });
  const value = (name: string) => values[name] ?? "";
  const field = (name: keyof ItemValues, text: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={name} className={label}>{text}</label>
      <input id={name} name={name} required defaultValue={value(name)} className="w-full" {...props} />
    </div>
  );
  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("sku", "SKU", { maxLength: 64, placeholder: "WH-0042" })}
        {field("name", "Name", { maxLength: 200, placeholder: "Nitrile gloves, size M" })}
        {field("location", "Location", { maxLength: 100, placeholder: "Aisle 3, Bin B" })}
        {field("unit", "Unit", { maxLength: 20, placeholder: "box" })}
        {field("reorderPoint", "Reorder point", { type: "number", min: 0, step: 1, inputMode: "numeric" })}
        {!item && (
          <div>
            <label htmlFor="openingQuantity" className={label}>Opening quantity</label>
            <input id="openingQuantity" name="openingQuantity" type="number" min={0} step={1} inputMode="numeric"
              defaultValue={value("openingQuantity")} className="w-full" />
          </div>
        )}
      </div>
      {item && <p className="text-sm text-muted">Quantity on hand changes only by recording a movement.</p>}
      <Status state={state} />
      <button type="submit" disabled={pending} className={button}>{item ? "Save changes" : "Add item"}</button>
    </form>
  );
}
