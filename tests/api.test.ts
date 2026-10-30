import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => { throw new Error("tests never open a database"); } }));
vi.mock("@/lib/inventory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/inventory")>()),
  listItems: vi.fn(),
  getItem: vi.fn(),
  listMovements: vi.fn(),
  recordMovement: vi.fn(),
}));

import { GET as getItemRoute } from "../app/api/items/[id]/route";
import { POST as postMovement } from "../app/api/items/[id]/movements/route";
import { operations } from "../app/api/items/openapi";
import { GET as listItemsRoute } from "../app/api/items/route";
import { InsufficientStock, getItem, listItems, listMovements, recordMovement } from "../lib/inventory";

const keyHeaders = {
  "X-Floo-Auth-Method": "api_key",
  "X-Floo-Api-Consumer-Id": "consumer-9",
  "X-Floo-Api-Consumer-Name": "restock-agent",
  "X-Floo-Api-Key-Id": "key-42",
  "X-Floo-Api-Key-Scopes": "api",
};

const itemId = "0b8f3c2e-6a1d-4f5b-9c7e-2d4a6b8c0e1f";
const item = {
  id: itemId,
  sku: "SAF-0030",
  name: "Nitrile gloves, size M",
  location: "Supply cage",
  unit: "box",
  quantityOnHand: 8,
  reorderPoint: 10,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};
const movement = {
  id: "5d1c8f7a-3b2e-4c6d-9a8b-7e6f5d4c3b2a",
  itemId,
  kind: "out" as const,
  quantityChange: -2,
  note: "job 47",
  actorId: "consumer-9",
  actorName: "restock-agent",
  createdAt: new Date("2026-01-03T00:00:00Z"),
};

const context = { params: Promise.resolve({ id: itemId }) };

// Every response a handler gives must match what the OpenAPI document declares.
async function expectDocumented(method: "get" | "post", path: string, response: Response): Promise<unknown> {
  const declared = operations.find((operation) => operation.method === method && operation.path === path)
    ?.responses[response.status];
  expect(declared?.schema, `${method.toUpperCase()} ${path} ${response.status} is not documented`).toBeDefined();
  const body: unknown = await response.json();
  declared?.schema?.parse(body);
  return body;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/items", () => {
  const list = (query = "") => listItemsRoute(new Request(`http://app/api/items${query}`, { headers: keyHeaders }));

  it("lists items and marks the ones at or below their reorder point", async () => {
    vi.mocked(listItems).mockResolvedValue([item, { ...item, id: movement.id, quantityOnHand: 40 }]);
    const response = await list();
    expect(response.status).toBe(200);
    const body = await expectDocumented("get", "/api/items", response) as { items: { lowStock: boolean }[] };
    expect(body.items.map((entry) => entry.lowStock)).toEqual([true, false]);
    expect(listItems).toHaveBeenCalledWith({ q: undefined, lowOnly: undefined });
  });

  it("passes the search and the low-stock filter through", async () => {
    vi.mocked(listItems).mockResolvedValue([]);
    await expectDocumented("get", "/api/items", await list("?q=%20gloves%20&low=true"));
    expect(listItems).toHaveBeenCalledWith({ q: "gloves", lowOnly: true });
  });

  it("answers an invalid filter with 400", async () => {
    const response = await list("?low=maybe");
    expect(response.status).toBe(400);
    expect(await expectDocumented("get", "/api/items", response)).toEqual({ error: "low must be true or false." });
    expect(listItems).not.toHaveBeenCalled();
  });

  it("refuses a request that did not come through the gateway", async () => {
    await expect(listItemsRoute(new Request("http://app/api/items"))).rejects.toThrow("did not come through the floo gateway");
    expect(listItems).not.toHaveBeenCalled();
  });
});

describe("GET /api/items/{id}", () => {
  const get = () => getItemRoute(new Request(`http://app/api/items/${itemId}`, { headers: keyHeaders }), context);

  it("returns the item with its recent movements", async () => {
    vi.mocked(getItem).mockResolvedValue(item);
    vi.mocked(listMovements).mockResolvedValue([movement]);
    const response = await get();
    expect(response.status).toBe(200);
    expect(await expectDocumented("get", "/api/items/{id}", response)).toMatchObject({
      item: { sku: "SAF-0030", lowStock: true },
      movements: [{ quantityChange: -2, createdAt: "2026-01-03T00:00:00.000Z" }],
    });
    expect(listMovements).toHaveBeenCalledWith(itemId, 20);
  });

  it("answers an unknown item with 404", async () => {
    vi.mocked(getItem).mockResolvedValue(undefined);
    const response = await get();
    expect(response.status).toBe(404);
    await expectDocumented("get", "/api/items/{id}", response);
  });
});

describe("POST /api/items/{id}/movements", () => {
  const path = "/api/items/{id}/movements";
  const post = (body: BodyInit) =>
    postMovement(new Request(`http://app/api/items/${itemId}/movements`, { method: "POST", headers: keyHeaders, body }), context);

  it("records the movement as the key's consumer", async () => {
    vi.mocked(recordMovement).mockResolvedValue({ item: { ...item, quantityOnHand: 6 }, movement });
    const response = await post(JSON.stringify({ kind: "out", quantity: 2, note: " job 47 " }));
    expect(response.status).toBe(201);
    expect(await expectDocumented("post", path, response)).toMatchObject({ item: { quantityOnHand: 6 }, movement: { kind: "out" } });
    expect(recordMovement).toHaveBeenCalledWith(
      itemId,
      { kind: "out", quantity: 2, note: "job 47" },
      { id: "consumer-9", name: "restock-agent" },
    );
  });

  it.each([
    ["not JSON", "not json"],
    ["an unknown kind", JSON.stringify({ kind: "lost", quantity: 1 })],
    ["a fractional quantity", JSON.stringify({ kind: "in", quantity: 1.5 })],
  ])("answers %s with 400", async (_label, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    await expectDocumented("post", path, response);
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it("answers an unknown item with 404", async () => {
    vi.mocked(recordMovement).mockResolvedValue(undefined);
    const response = await post(JSON.stringify({ kind: "in", quantity: 1 }));
    expect(response.status).toBe(404);
    await expectDocumented("post", path, response);
  });

  it("answers a movement that would go below zero with 409", async () => {
    vi.mocked(recordMovement).mockRejectedValue(new InsufficientStock("Only 8 box of SAF-0030 on hand."));
    const response = await post(JSON.stringify({ kind: "out", quantity: 9 }));
    expect(response.status).toBe(409);
    expect(await expectDocumented("post", path, response)).toEqual({ error: "Only 8 box of SAF-0030 on hand." });
  });
});
