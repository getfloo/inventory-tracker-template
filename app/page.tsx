import Link from "next/link";
import { syncUser } from "@/db/users";
import { getIdentity } from "@/lib/identity";
import { isLow, latestLowStockReport, listItems } from "@/lib/inventory";
import { recordMovementAction } from "./actions";
import { MovementForm } from "./forms";
import { StockBadge, Time } from "./ui";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const identity = await getIdentity();
  await syncUser(identity);
  const { q, low } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const lowOnly = low === "1";
  const [shown, allItems, report] = await Promise.all([
    listItems({ q: query, lowOnly }),
    listItems({}),
    latestLowStockReport(),
  ]);
  const lowCount = allItems.filter(isLow).length;
  const isAdmin = identity.role === "admin";

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="mt-2 text-muted">
            {allItems.length} {allItems.length === 1 ? "item" : "items"}
            {lowCount > 0 && <>, <span className="text-warning">{lowCount} at or below reorder point</span></>}
          </p>
        </div>
        {isAdmin && (
          <Link href="/items/new" className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover">
            New item
          </Link>
        )}
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.25fr)]">
        <section aria-labelledby="items-heading" className="min-w-0">
          <h2 id="items-heading" className="sr-only">Items</h2>
          <form className="mb-4 flex flex-wrap items-center gap-3" role="search">
            <input name="q" type="search" defaultValue={query} placeholder="Search SKU, name or location"
              aria-label="Search items" className="min-w-0 basis-full placeholder:text-muted sm:flex-1 sm:basis-auto" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="low" value="1" defaultChecked={lowOnly} /> Low stock only
            </label>
            <button type="submit" className="cursor-pointer rounded-sm border bg-panel px-4 py-2 text-sm hover:bg-surface">Filter</button>
          </form>

          {shown.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-muted">
              {allItems.length > 0 ? (
                <p>No items match. <Link href="/" className="text-accent hover:underline">Clear the filter</Link>.</p>
              ) : isAdmin ? (
                <p>No items yet. <Link href="/items/new" className="text-accent hover:underline">Add your first item</Link>, or load sample data with <code>floo run --service web -- npm run seed</code>.</p>
              ) : (
                <p>No items yet. An app admin adds items; then you can record stock in and out here.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th className="hidden sm:table-cell">SKU</th>
                    <th>Name</th>
                    <th className="hidden md:table-cell">Location</th>
                    <th className="text-right">On hand</th>
                    <th className="hidden text-right whitespace-nowrap sm:table-cell">Reorder at</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((item) => (
                    <tr key={item.id} className={isLow(item) ? "bg-warning-soft/40" : undefined}>
                      <td className="hidden font-mono text-xs whitespace-nowrap sm:table-cell">{item.sku}</td>
                      <td>
                        <Link href={`/items/${item.id}`} className="font-medium hover:text-accent hover:underline">{item.name}</Link>
                        <span className="block font-mono text-xs text-muted sm:hidden">{item.sku}</span>
                      </td>
                      <td className="hidden text-muted md:table-cell">{item.location}</td>
                      <td className="text-right whitespace-nowrap">{item.quantityOnHand} <span className="text-muted">{item.unit}</span></td>
                      <td className="hidden text-right text-muted sm:table-cell">{item.reorderPoint}</td>
                      <td><StockBadge item={item} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="space-y-8">
          <section aria-labelledby="record-heading" className="rounded-md border bg-panel p-5">
            <h2 id="record-heading" className="mb-4 text-lg font-semibold">Record a movement</h2>
            {allItems.length > 0 ? (
              <MovementForm action={recordMovementAction}
                items={allItems.map(({ id, sku, name, unit }) => ({ id, sku, name, unit }))} />
            ) : (
              <p className="text-sm text-muted">Add an item first.</p>
            )}
          </section>

          <section aria-labelledby="check-heading" className="rounded-md border bg-panel p-5 text-sm">
            <h2 id="check-heading" className="mb-2 font-semibold">Last low-stock check</h2>
            {report ? (
              <>
                <p className="text-muted"><Time date={report.checkedAt} /></p>
                <p className="mt-2">
                  {report.itemCount === 0 ? "Every item was above its reorder point." : `${report.itemCount} ${report.itemCount === 1 ? "item was" : "items were"} at or below reorder point:`}
                </p>
                {report.itemCount > 0 && (
                  <ul className="mt-2 space-y-1">
                    {report.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-3">
                        <Link href={`/items/${item.id}`} className="truncate hover:text-accent hover:underline">{item.name}</Link>
                        <span className="shrink-0 text-muted">{item.quantityOnHand} / {item.reorderPoint} {item.unit}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-muted">Not run yet. The low-stock job runs once a day and records which items need reordering.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
