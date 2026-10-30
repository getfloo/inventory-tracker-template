import { type Item, isLow } from "@/lib/inventory";

/** Times show in UTC, the same clock the cron schedule uses. */
export function Time({ date }: { date: Date }) {
  return (
    <time dateTime={date.toISOString()} className="whitespace-nowrap">
      {date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
    </time>
  );
}

const badge = "inline-block whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium";

export function StockBadge({ item }: { item: Pick<Item, "quantityOnHand" | "reorderPoint"> }) {
  if (item.quantityOnHand === 0) return <span className={`${badge} bg-danger-soft text-danger`}>Out</span>;
  if (isLow(item)) return <span className={`${badge} bg-warning-soft text-warning`}>Low</span>;
  return <span className={`${badge} bg-success-soft text-success`}>In stock</span>;
}

export function NotAllowed() {
  return (
    <p className="rounded-md border border-dashed p-8 text-center text-muted">
      Only app admins can add or edit items. Ask an admin, or record a movement from the item list.
    </p>
  );
}
