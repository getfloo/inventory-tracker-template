import "server-only";
import { z } from "zod";

/** One operation the app serves under /api, described by the schemas its handler validates with. */
export type Operation = {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: `/api/${string}`;
  /** Unique across the API; generated clients and agents name the call by it. */
  operationId: string;
  summary: string;
  /** Path parameters, such as `id` in `/api/items/{id}`. */
  params?: z.ZodObject;
  /** Query-string parameters. */
  query?: z.ZodObject;
  request?: z.ZodType;
  responses: Record<number, { description: string; schema?: z.ZodType }>;
};

/** The body every handler returns with a 4xx it produces itself. */
export const ApiError = z.object({ error: z.string() });

// The gateway answers these before a request reaches the app, so every
// operation can return them and no handler implements them.
const GATEWAY_RESPONSES: Operation["responses"] = {
  401: { description: "Missing, malformed, revoked, or wrong-app API key." },
  403: { description: 'The key does not hold the "api" scope.' },
  429: { description: "The key's per-minute rate limit was exceeded." },
};

// OpenAPI 3.1 schemas are JSON Schema 2020-12, which is zod's default target.
// The dialect is declared once for the document, not on every schema.
// zod also attaches a non-enumerable "~standard" property, which React refuses to pass
// to the /api-docs client component; a JSON round trip keeps only the schema itself.
function jsonSchema(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
  const generated: Record<string, unknown> = JSON.parse(JSON.stringify(z.toJSONSchema(schema, { io })));
  delete generated.$schema;
  return generated;
}

function jsonContent(schema: z.ZodType, io: "input" | "output") {
  return { "application/json": { schema: jsonSchema(schema, io) } };
}

function parameters(schema: z.ZodObject | undefined, location: "path" | "query") {
  if (!schema) return [];
  const { properties, required = [] } = jsonSchema(schema, "input") as {
    properties: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === "path" || required.includes(name),
    schema: property,
  }));
}

/** Builds the OpenAPI document served at /api/openapi.json. */
export function openApiDocument(operations: Operation[], serverUrl = process.env.FLOO_APP_URL) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of operations) {
    const responses = { ...GATEWAY_RESPONSES, ...operation.responses };
    paths[operation.path] ??= {};
    paths[operation.path][operation.method] = {
      operationId: operation.operationId,
      summary: operation.summary,
      parameters: [...parameters(operation.params, "path"), ...parameters(operation.query, "query")],
      ...(operation.request && {
        requestBody: { required: true, content: jsonContent(operation.request, "input") },
      }),
      responses: Object.fromEntries(
        Object.entries(responses).map(([status, response]) => [
          status,
          {
            description: response.description,
            ...(response.schema && { content: jsonContent(response.schema, "output") }),
          },
        ]),
      ),
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Inventory API", version: "1" },
    // floo sets FLOO_APP_URL to this environment's public URL.
    ...(serverUrl && { servers: [{ url: serverUrl }] }),
    components: {
      securitySchemes: {
        appKey: {
          type: "http",
          scheme: "bearer",
          description: 'An app API key holding the "api" scope, from `floo apps keys create <name> --consumer <consumer> --scope api`.',
        },
      },
    },
    security: [{ appKey: [] }],
    paths,
  };
}
