import "server-only";
import { headers } from "next/headers";

/** A person signed in through floo's hosted login. */
export type User = {
  kind: "user";
  id: string;
  email: string;
  name: string;
  role: string;
};

/** A program calling with an app API key minted by `floo apps keys create`. */
export type ApiKeyCaller = {
  kind: "api_key";
  /** The consumer the key belongs to; stable across key rotation. */
  id: string;
  name: string;
  keyId: string;
  scopes: string[];
};

export type Caller = User | ApiKeyCaller;

const NOT_FROM_GATEWAY =
  "this request did not come through the floo gateway. Use floo dev locally and accounts mode when deployed.";

// The gateway strips every inbound X-Floo-* header and injects its own, so these
// are trustworthy only while it is the sole ingress (access_mode = "accounts").
export function callerFrom(requestHeaders: Headers): Caller {
  const required = (header: string): string => {
    const value = requestHeaders.get(header)?.trim();
    if (!value) {
      throw new Error(`Missing ${header}: ${NOT_FROM_GATEWAY}`);
    }
    return value;
  };

  if (requestHeaders.get("X-Floo-Auth-Method")?.trim() === "api_key") {
    return {
      kind: "api_key",
      id: required("X-Floo-Api-Consumer-Id"),
      name: requestHeaders.get("X-Floo-Api-Consumer-Name")?.trim() || "",
      keyId: required("X-Floo-Api-Key-Id"),
      scopes: required("X-Floo-Api-Key-Scopes").split(",").filter(Boolean),
    };
  }
  return {
    kind: "user",
    id: required("X-Floo-User-Id"),
    email: required("X-Floo-User-Email"),
    // A valid account may have no display name.
    name: requestHeaders.get("X-Floo-User-Name")?.trim() ?? "",
    role: required("X-Floo-User-Role"),
  };
}

/** Whoever the gateway authenticated: a signed-in user or an API key. */
export async function getCaller(): Promise<Caller> {
  return callerFrom(await headers());
}

/** The signed-in user. Pages and server actions sit on `accounts` routes, so a key never reaches them. */
export async function getIdentity(): Promise<User> {
  const caller = await getCaller();
  if (caller.kind !== "user") {
    throw new Error("This request carries an API key, not a signed-in user. Use getCaller() on /api routes.");
  }
  return caller;
}

/** The signed-in user, who must hold the app's admin role. Members record movements; admins manage items. */
export async function getAdmin(): Promise<User> {
  const user = await getIdentity();
  if (user.role !== "admin") {
    throw new Error("Only app admins can add or edit items.");
  }
  return user;
}
