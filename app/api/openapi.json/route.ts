import { callerFrom } from "@/lib/identity";
import { openApiDocument } from "@/lib/openapi";
import { operations } from "../operations";

// Served under /api, so the gateway requires the same API key as every other
// endpoint; the spec is never public. Signed-in people read it at /api-docs.

export function GET(request: Request): Response {
  callerFrom(request.headers);
  return Response.json(openApiDocument(operations));
}
