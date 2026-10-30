// The daily low-stock check: [cron.low-stock] in floo.app.toml runs this in the web
// service's image, which has the same DATABASE_URL as the app. It records which items
// are at or below their reorder point; the item list shows the latest report.
// Run it now with `floo cron run low-stock`.
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { isLowStock, items, lowStockReports } from "../db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("Missing DATABASE_URL. floo injects managed Postgres credentials into cron jobs.");
}

const client = postgres(url, { max: 1 });
try {
  const db = drizzle(client);
  const low = await db.select({
    id: items.id,
    sku: items.sku,
    name: items.name,
    quantityOnHand: items.quantityOnHand,
    reorderPoint: items.reorderPoint,
    unit: items.unit,
  }).from(items).where(isLowStock).orderBy(asc(items.name));
  await db.insert(lowStockReports).values({ itemCount: low.length, items: low });
  console.log(`Low-stock check: ${low.length} item(s) at or below reorder point.`);
  for (const item of low) {
    console.log(`  ${item.sku} ${item.name}: ${item.quantityOnHand} ${item.unit} (reorder at ${item.reorderPoint})`);
  }
} finally {
  await client.end();
}
