import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: () => { throw new Error("tests never open a database"); } }));

import { InvalidInput, MovementInput, NewItemInput, actorFor, parse, quantityChange } from "../lib/inventory";

describe("quantityChange", () => {
  it("adds stock in and removes stock out", () => {
    expect(quantityChange({ kind: "in", quantity: 5 })).toBe(5);
    expect(quantityChange({ kind: "out", quantity: 5 })).toBe(-5);
  });

  it("takes an adjustment as a signed change", () => {
    expect(quantityChange({ kind: "adjustment", quantity: -2 })).toBe(-2);
    expect(quantityChange({ kind: "adjustment", quantity: 3 })).toBe(3);
  });

  it.each([
    [{ kind: "in", quantity: 0 }, "Quantity in must be at least 1."],
    [{ kind: "out", quantity: -3 }, "Quantity out must be at least 1."],
    [{ kind: "adjustment", quantity: 0 }, "An adjustment must change the quantity."],
  ] as const)("rejects %j", (input, message) => {
    expect(() => quantityChange(input)).toThrow(new InvalidInput(message));
  });
});

describe("input validation", () => {
  it("defaults a movement note to empty and trims it", () => {
    expect(parse(MovementInput, { kind: "in", quantity: 1 })).toEqual({ kind: "in", quantity: 1, note: "" });
    expect(parse(MovementInput, { kind: "in", quantity: 1, note: "  PO-1 " }).note).toBe("PO-1");
  });

  it("requires every item field and a whole, non-negative reorder point", () => {
    const item = { sku: "A-1", name: "Tape", location: "Bin 1", unit: "roll", reorderPoint: 3 };
    expect(parse(NewItemInput, item).openingQuantity).toBe(0);
    expect(() => parse(NewItemInput, { ...item, sku: "  " })).toThrow("SKU is required.");
    expect(() => parse(NewItemInput, { ...item, reorderPoint: -1 })).toThrow("Reorder point cannot be negative.");
    expect(() => parse(NewItemInput, { ...item, reorderPoint: undefined })).toThrow("Reorder point must be a whole number.");
  });
});

describe("actorFor", () => {
  it("names a person by display name, then email", () => {
    const user = { kind: "user", id: "u1", email: "pat@example.com", name: "", role: "member" } as const;
    expect(actorFor(user)).toEqual({ id: "u1", name: "pat@example.com" });
    expect(actorFor({ ...user, name: "Pat" })).toEqual({ id: "u1", name: "Pat" });
  });

  it("names a key caller by its consumer", () => {
    const key = { kind: "api_key" as const, id: "c1", name: "restock-agent", keyId: "k1", scopes: ["api"] };
    expect(actorFor(key)).toEqual({ id: "c1", name: "restock-agent" });
  });
});

describe("low-stock cron job", () => {
  // The job runs in the web image, so its script and what it imports must be copied there.
  it("runs a script the Dockerfile ships in the runner image", () => {
    const config = readFileSync("floo.app.toml", "utf8");
    const command = config.match(/\[cron\.low-stock\][^[]*?command = "([^"]+)"/)?.[1];
    expect(command).toBe("node_modules/.bin/tsx scripts/low-stock.ts");
    const dockerfile = readFileSync("Dockerfile", "utf8");
    for (const file of ["scripts/low-stock.ts", "db/schema.ts"]) {
      expect(dockerfile).toContain(`/app/${file} ./${file}`);
    }
  });
});
