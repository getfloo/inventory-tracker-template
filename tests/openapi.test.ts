import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { headers } from "next/headers";
import ApiDocs from "../app/api-docs/page";
import { GET } from "../app/api/openapi.json/route";
import { operations } from "../app/api/operations";
import { openApiDocument } from "../lib/openapi";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const keyHeaders = {
  "X-Floo-Auth-Method": "api_key",
  "X-Floo-Api-Consumer-Id": "consumer-9",
  "X-Floo-Api-Key-Id": "key-42",
  "X-Floo-Api-Key-Scopes": "api",
};

type Document = {
  servers?: { url: string }[];
  paths: Record<string, Record<string, {
    operationId?: string;
    parameters: { name: string; in: string; required: boolean }[];
    requestBody?: { content: { "application/json": { schema: Record<string, unknown> } } };
    responses: Record<string, unknown>;
  }>>;
};

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

// app/api/items/[id]/route.ts serves /api/items/{id}.
function urlPath(file: string): string {
  const segments = relative("app", file).split(sep).slice(0, -1);
  return "/" + segments.map((segment) => segment.replace(/^\[(.+)\]$/, "{$1}")).join("/");
}

// The document describes the API, not itself.
const apiRoutes = routeFiles("app/api").filter((file) => urlPath(file) !== "/api/openapi.json");

async function servedDocument(): Promise<Document> {
  return GET(new Request("http://app/api/openapi.json", { headers: keyHeaders })).json();
}

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/openapi.json", () => {
  it("documents every handler under app/api", async () => {
    const document = await servedDocument();
    expect(apiRoutes.length).toBeGreaterThan(0);
    for (const file of apiRoutes) {
      const handlers: Record<string, unknown> = await import(join(process.cwd(), file));
      const exported = METHODS.filter((method) => method in handlers);
      expect(exported, `${file} exports no HTTP handler`).not.toHaveLength(0);
      for (const method of exported) {
        expect(
          document.paths[urlPath(file)]?.[method.toLowerCase()],
          `${method} ${urlPath(file)} is missing: add its operations to app/api/operations.ts`,
        ).toBeDefined();
      }
    }
  });

  it("documents no path without a route", async () => {
    const served = new Set(apiRoutes.map(urlPath));
    for (const path of Object.keys((await servedDocument()).paths)) {
      expect(served, `${path} is documented but has no route.ts`).toContain(path);
    }
  });

  it("gives every operation a unique operationId", async () => {
    const ids = Object.values((await servedDocument()).paths).flatMap((operations) =>
      Object.values(operations).map((operation) => operation.operationId),
    );
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("generates request schemas from the validator the handler uses", async () => {
    const post = (await servedDocument()).paths["/api/items/{id}/movements"].post;
    expect(post.requestBody?.content["application/json"].schema).toMatchObject({
      type: "object",
      required: ["kind", "quantity"],
      properties: { kind: { enum: ["in", "out", "adjustment"] }, quantity: { type: "integer" } },
    });
  });

  it("declares every path parameter and the list filters", async () => {
    const paths = (await servedDocument()).paths;
    for (const [path, operations] of Object.entries(paths)) {
      const inPath = Array.from(path.matchAll(/\{(\w+)\}/g), ([, name]) => name);
      for (const operation of Object.values(operations)) {
        const declared = operation.parameters.filter((parameter) => parameter.in === "path");
        expect(declared.map((parameter) => parameter.name), `${path} path parameters`).toEqual(inPath);
        expect(declared.every((parameter) => parameter.required)).toBe(true);
      }
    }
    expect(paths["/api/items"].get.parameters.map(({ name, in: location }) => [name, location]))
      .toEqual([["q", "query"], ["low", "query"]]);
  });

  it("lists the responses the gateway gives before the app runs", async () => {
    for (const operations of Object.values((await servedDocument()).paths)) {
      for (const operation of Object.values(operations)) {
        expect(Object.keys(operation.responses)).toEqual(expect.arrayContaining(["401", "403", "429"]));
      }
    }
  });

  it("names this environment's public URL as the server", async () => {
    vi.stubEnv("FLOO_APP_URL", "https://app-dev.on.getfloo.com");
    expect((await servedDocument()).servers).toEqual([{ url: "https://app-dev.on.getfloo.com" }]);
  });

  it("refuses a request that did not come through the gateway", () => {
    expect(() => GET(new Request("http://app/api/openapi.json"))).toThrow("did not come through the floo gateway");
  });
});

describe("/api-docs", () => {
  it("passes the served OpenAPI document to the signed-in reference", async () => {
    vi.stubEnv("FLOO_APP_URL", "https://app-dev.on.getfloo.com");
    vi.mocked(headers).mockResolvedValue(new Headers({
      "X-Floo-User-Id": "user-123",
      "X-Floo-User-Email": "pat@example.com",
      "X-Floo-User-Name": "Pat",
      "X-Floo-User-Role": "admin",
    }) as Awaited<ReturnType<typeof headers>>);

    const page = await ApiDocs();
    expect(page.props.document).toEqual(await servedDocument());
  });

  it("passes only plain data, which React can send to a client component", async () => {
    const hidden: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (value === null || typeof value !== "object") return;
      for (const key of Object.getOwnPropertyNames(value)) {
        if (!Array.isArray(value) && !Object.keys(value).includes(key)) hidden.push(`${path}.${key}`);
        walk((value as Record<string, unknown>)[key], `${path}.${key}`);
      }
    };
    walk(openApiDocument(operations), "document");
    expect(hidden).toEqual([]);
  });
});
