import { callerFrom } from "@/lib/identity";
import { InvalidInput, ListItemsQuery, listItems, parse } from "@/lib/inventory";
import { itemJson } from "./openapi";

// The gateway serves /api only to callers holding an app API key with the "api"
// scope ([[routes]] in floo.app.toml) and has already verified the key. Every key
// holder sees every item, as every signed-in person does. The contract is in ./openapi.ts.

export async function GET(request: Request): Promise<Response> {
  callerFrom(request.headers);
  try {
    const { q, low } = parse(ListItemsQuery, Object.fromEntries(new URL(request.url).searchParams));
    return Response.json({ items: (await listItems({ q, lowOnly: low })).map(itemJson) });
  } catch (error) {
    if (error instanceof InvalidInput) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
