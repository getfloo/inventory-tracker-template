import Link from "next/link";
import { notFound } from "next/navigation";
import { syncUser } from "@/db/users";
import { getIdentity } from "@/lib/identity";
import { getItem, listMovements } from "@/lib/inventory";
import { recordMovementAction } from "../../actions";
import { MovementForm } from "../../forms";
import { StockBadge, Time } from "../../ui";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 50;
const KIND_LABEL = { in: "In", out: "Out", adjustment: "Adjustment" } as const;

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
  const identity = await getIdentity();
  await syncUser(identity);
  const item = await getItem((await params).id);
  if (!item) notFound();
  const movements = await listMovements(item.id, HISTORY_LIMIT);

  return (
    <>
      <p className="mb-4 text-sm"><Link href="/" className="text-muted hover:text-ink">← All items</Link></p>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted">{item.sku}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight wrap-anywhere">{item.name}</h1>
          <p className="mt-1 text-muted">{item.location}</p>
        </div>
        {identity.role === "admin" && (
          <Link href={`/items/${item.id}/edit`} className="rounded-sm border bg-panel px-4 py-2 text-sm hover:bg-surface">Edit item</Link>
        )}
      </header>

      <dl className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-md border bg-panel p-4">
          <dt className="text-sm text-muted">On hand</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{item.quantityOnHand} <span className="text-base font-normal text-muted">{item.unit}</span></dd>
        </div>
        <div className="rounded-md border bg-panel p-4">
          <dt className="text-sm text-muted">Reorder point</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{item.reorderPoint}</dd>
        </div>
        <div className="col-span-2 rounded-md border bg-panel p-4 sm:col-span-1">
          <dt className="text-sm text-muted">Status</dt>
          <dd className="mt-2"><StockBadge item={item} /></dd>
        </div>
      </dl>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,3fr)]">
        <section aria-labelledby="record-heading" className="h-fit rounded-md border bg-panel p-5">
          <h2 id="record-heading" className="mb-4 text-lg font-semibold">Record a movement</h2>
          <MovementForm action={recordMovementAction} item={{ id: item.id, sku: item.sku, name: item.name, unit: item.unit }} />
        </section>

        <section aria-labelledby="history-heading" className="min-w-0">
          <h2 id="history-heading" className="mb-4 text-lg font-semibold">Movement history</h2>
          {movements.length === 0 ? (
            <p className="rounded-md border border-dashed p-8 text-center text-muted">No movements yet. Record stock in or out to start the history.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr><th>When</th><th>Movement</th><th className="text-right">Change</th><th>Note</th><th>By</th></tr>
                  </thead>
                  <tbody>
                    {movements.map((movement) => (
                      <tr key={movement.id}>
                        <td className="text-muted"><Time date={movement.createdAt} /></td>
                        <td>{KIND_LABEL[movement.kind]}</td>
                        <td className={`text-right font-medium ${movement.quantityChange > 0 ? "text-success" : "text-danger"}`}>
                          {movement.quantityChange > 0 ? `+${movement.quantityChange}` : movement.quantityChange}
                        </td>
                        <td className="wrap-anywhere">{movement.note || <span className="text-muted">None</span>}</td>
                        <td className="whitespace-nowrap">{movement.actorName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {movements.length === HISTORY_LIMIT && (
                <p className="mt-3 text-sm text-muted">Showing the latest {HISTORY_LIMIT} movements.</p>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
