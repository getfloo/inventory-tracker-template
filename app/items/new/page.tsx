import Link from "next/link";
import { getIdentity } from "@/lib/identity";
import { createItemAction } from "../../actions";
import { ItemForm } from "../../forms";
import { NotAllowed } from "../../ui";

export const dynamic = "force-dynamic";

export default async function NewItem() {
  const identity = await getIdentity();
  return (
    <>
      <p className="mb-4 text-sm"><Link href="/" className="text-muted hover:text-ink">← All items</Link></p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New item</h1>
      {identity.role === "admin" ? <ItemForm action={createItemAction} /> : <NotAllowed />}
    </>
  );
}
