import Link from "next/link";
import { notFound } from "next/navigation";
import { getIdentity } from "@/lib/identity";
import { getItem } from "@/lib/inventory";
import { updateItemAction } from "../../../actions";
import { ItemForm } from "../../../forms";
import { NotAllowed } from "../../../ui";

export const dynamic = "force-dynamic";

export default async function EditItem({ params }: PageProps<"/items/[id]/edit">) {
  const identity = await getIdentity();
  const item = await getItem((await params).id);
  if (!item) notFound();
  const { sku, name, location, unit, reorderPoint } = item;

  return (
    <>
      <p className="mb-4 text-sm"><Link href={`/items/${item.id}`} className="text-muted hover:text-ink">← {item.name}</Link></p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit item</h1>
      {identity.role === "admin"
        ? <ItemForm action={updateItemAction.bind(null, item.id)} item={{ sku, name, location, unit, reorderPoint }} />
        : <NotAllowed />}
    </>
  );
}
