import { callerFrom } from "@/lib/identity";
import { getItem, listMovements } from "@/lib/inventory";
import { RECENT_MOVEMENTS, itemJson } from "../openapi";

export async function GET(request: Request, { params }: RouteContext<"/api/items/[id]">): Promise<Response> {
  callerFrom(request.headers);
  const item = await getItem((await params).id);
  if (!item) return Response.json({ error: "No item has this id." }, { status: 404 });
  return Response.json({ item: itemJson(item), movements: await listMovements(item.id, RECENT_MOVEMENTS) });
}
