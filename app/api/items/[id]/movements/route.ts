import { callerFrom } from "@/lib/identity";
import { InsufficientStock, InvalidInput, MovementInput, actorFor, parse, recordMovement } from "@/lib/inventory";
import { itemJson } from "../../openapi";

// The movement is recorded as the API consumer that holds the key.
export async function POST(request: Request, { params }: RouteContext<"/api/items/[id]/movements">): Promise<Response> {
  const caller = callerFrom(request.headers);
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: 'Send JSON like {"kind": "out", "quantity": 2, "note": "job 47"}.' }, { status: 400 });
  }
  try {
    const result = await recordMovement((await params).id, parse(MovementInput, input), actorFor(caller));
    if (!result) return Response.json({ error: "No item has this id." }, { status: 404 });
    return Response.json({ movement: result.movement, item: itemJson(result.item) }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidInput) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof InsufficientStock) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
