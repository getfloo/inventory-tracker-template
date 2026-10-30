import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { headers } from "next/headers";
import { callerFrom, getAdmin, getCaller, getIdentity } from "../lib/identity";

const sessionHeaders = {
  "X-Floo-Auth-Method": "session",
  "X-Floo-User-Id": "user-123",
  "X-Floo-User-Email": "pat@example.com",
  "X-Floo-User-Name": "Pat",
  "X-Floo-User-Role": "admin",
};

const keyHeaders = {
  "X-Floo-Auth-Method": "api_key",
  "X-Floo-Api-Consumer-Id": "consumer-9",
  "X-Floo-Api-Consumer-Name": "nightly-agent",
  "X-Floo-Api-Key-Id": "key-42",
  "X-Floo-Api-Key-Name": "reader",
  "X-Floo-Api-Key-Scopes": "api,reports.read",
};

const requiredUserHeaderNames = ["X-Floo-User-Id", "X-Floo-User-Email", "X-Floo-User-Role"];

function useHeaders(values: Headers) {
  vi.mocked(headers).mockResolvedValue(values as Awaited<ReturnType<typeof headers>>);
}

beforeEach(() => vi.clearAllMocks());

describe("signed-in user", () => {
  it("reads all four case-insensitive gateway headers", async () => {
    useHeaders(new Headers(sessionHeaders));
    await expect(getIdentity()).resolves.toEqual({
      kind: "user",
      id: "user-123",
      email: "pat@example.com",
      name: "Pat",
      role: "admin",
    });
  });

  it("accepts a signed-in user without a display-name header", async () => {
    const values = new Headers(sessionHeaders);
    values.delete("X-Floo-User-Name");
    useHeaders(values);
    await expect(getIdentity()).resolves.toEqual({
      kind: "user",
      id: "user-123",
      email: "pat@example.com",
      name: "",
      role: "admin",
    });
  });

  it.each(["", "  "])("accepts a signed-in user with an empty display name %j", async (name) => {
    useHeaders(new Headers({ ...sessionHeaders, "X-Floo-User-Name": name }));
    expect((await getIdentity()).name).toBe("");
  });

  it("is what the gateway sends when no auth method header is present", () => {
    const values = new Headers(sessionHeaders);
    values.delete("X-Floo-Auth-Method");
    expect(callerFrom(values).kind).toBe("user");
  });

  it.each(requiredUserHeaderNames)("rejects a missing %s", async (header) => {
    const values = new Headers(sessionHeaders);
    values.delete(header);
    useHeaders(values);
    await expect(getIdentity()).rejects.toThrow(`Missing ${header}`);
  });

  it.each(requiredUserHeaderNames)("rejects a blank %s", async (header) => {
    useHeaders(new Headers({ ...sessionHeaders, [header]: "  " }));
    await expect(getIdentity()).rejects.toThrow("did not come through the floo gateway");
  });

  it.each(["admin", "member", "viewer", "custom-role"])("preserves the gateway role %s", async (role) => {
    useHeaders(new Headers({ ...sessionHeaders, "X-Floo-User-Role": role }));
    expect((await getIdentity()).role).toBe(role);
  });

  it("explains how to run a request with no gateway headers", async () => {
    useHeaders(new Headers());
    await expect(getIdentity()).rejects.toThrow("Use floo dev locally and accounts mode when deployed");
  });
});

describe("API key caller", () => {
  it("reads the consumer, key and scopes the gateway injected", () => {
    expect(callerFrom(new Headers(keyHeaders))).toEqual({
      kind: "api_key",
      id: "consumer-9",
      name: "nightly-agent",
      keyId: "key-42",
      scopes: ["api", "reports.read"],
    });
  });

  it("tolerates a consumer without a name", () => {
    const values = new Headers(keyHeaders);
    values.delete("X-Floo-Api-Consumer-Name");
    expect(callerFrom(values).name).toBe("");
  });

  it.each(["X-Floo-Api-Consumer-Id", "X-Floo-Api-Key-Id", "X-Floo-Api-Key-Scopes"])(
    "rejects a missing %s",
    (header) => {
      const values = new Headers(keyHeaders);
      values.delete(header);
      expect(() => callerFrom(values)).toThrow(`Missing ${header}`);
    },
  );

  it("is returned by getCaller but refused by getIdentity", async () => {
    useHeaders(new Headers(keyHeaders));
    expect((await getCaller()).kind).toBe("api_key");
    await expect(getIdentity()).rejects.toThrow("Use getCaller() on /api routes");
  });
});

describe("admin check", () => {
  it("returns a signed-in admin", async () => {
    useHeaders(new Headers(sessionHeaders));
    expect((await getAdmin()).role).toBe("admin");
  });

  it("refuses a member, whatever the client sent", async () => {
    useHeaders(new Headers({ ...sessionHeaders, "X-Floo-User-Role": "member" }));
    await expect(getAdmin()).rejects.toThrow("Only app admins can add or edit items.");
  });

  it("refuses an API key", async () => {
    useHeaders(new Headers(keyHeaders));
    await expect(getAdmin()).rejects.toThrow("Use getCaller() on /api routes");
  });
});
