import "server-only";
import type { User } from "@/lib/identity";
import { getDb } from "./index";
import { users } from "./schema";

export async function syncUser(user: User) {
  const identity = { id: user.id, email: user.email, name: user.name, role: user.role };
  await getDb().insert(users).values(identity).onConflictDoUpdate({
    target: users.id,
    set: {
      email: user.email,
      name: user.name,
      role: user.role,
      updatedAt: new Date(),
    },
  });
}
