// Loads sample items and movements into an empty database: `npm run seed` locally, or
// against the dev database with `floo run --service web -- npm run seed`. Never runs on
// deploy. It records every movement through lib/inventory.ts, the same path the app uses,
// so quantity on hand is the sum of the seeded movements. (`npm run seed` sets the
// react-server condition so that path's "server-only" import loads outside Next.)
import { getDb } from "../db";
import { items } from "../db/schema";
import { createItem, recordMovement } from "../lib/inventory";

const actor = { id: "seed", name: "Sample data" };

const sampleItems = [
  { sku: "PKG-0101", name: "Shipping box, 12 x 9 x 6 in", location: "Aisle 1, Bin A", unit: "each", reorderPoint: 100, openingQuantity: 400 },
  { sku: "PKG-0140", name: "Packing tape, 2 in clear", location: "Aisle 1, Bin C", unit: "roll", reorderPoint: 24, openingQuantity: 60 },
  { sku: "PKG-0210", name: "Bubble wrap, 12 in x 175 ft", location: "Aisle 1, Shelf 2", unit: "roll", reorderPoint: 4, openingQuantity: 6 },
  { sku: "SAF-0030", name: "Nitrile gloves, size M", location: "Supply cage", unit: "box", reorderPoint: 10, openingQuantity: 30 },
  { sku: "SAF-0045", name: "Safety glasses, clear", location: "Supply cage", unit: "each", reorderPoint: 15, openingQuantity: 20 },
  { sku: "ELE-1200", name: "USB-C cable, 2 m", location: "Aisle 3, Bin B", unit: "each", reorderPoint: 25, openingQuantity: 80 },
  { sku: "ELE-1310", name: "Label printer roll, 4 x 6 in", location: "Aisle 3, Bin D", unit: "roll", reorderPoint: 8, openingQuantity: 12 },
  { sku: "OFF-0500", name: "Printer paper, letter", location: "Office closet", unit: "ream", reorderPoint: 10, openingQuantity: 0 },
];

// [sku, kind, quantity, note]: a few weeks of ordinary use, leaving some items low.
const sampleMovements = [
  ["PKG-0101", "out", 120, "Weekly outbound orders"],
  ["PKG-0101", "out", 95, "Weekly outbound orders"],
  ["PKG-0140", "out", 30, "Packing station restock"],
  ["PKG-0140", "out", 8, "Packing station restock"],
  ["PKG-0210", "out", 3, "Fragile order batch"],
  ["SAF-0030", "out", 12, "Warehouse floor"],
  ["SAF-0030", "in", 20, "PO-1182 from supplier"],
  ["SAF-0045", "adjustment", -2, "Cycle count: two damaged"],
  ["ELE-1200", "out", 40, "Laptop setup kits"],
  ["ELE-1310", "out", 6, "Shipping labels"],
  ["OFF-0500", "in", 5, "PO-1190, partial delivery"],
] as const;

const db = getDb();
try {
  if ((await db.select({ id: items.id }).from(items).limit(1)).length > 0) {
    console.log("Items already exist; seed only loads an empty database.");
  } else {
    const ids = new Map<string, string>();
    for (const item of sampleItems) {
      ids.set(item.sku, (await createItem(item, actor)).id);
    }
    for (const [sku, kind, quantity, note] of sampleMovements) {
      await recordMovement(ids.get(sku)!, { kind, quantity, note }, actor);
    }
    console.log(`Seeded ${sampleItems.length} items and ${sampleMovements.length} movements.`);
  }
} finally {
  await db.$client.end();
}
