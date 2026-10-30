import { operations as items } from "./items/openapi";

// Every /api route's operations, in one list, feeding /api/openapi.json and
// /api-docs. tests/openapi.test.ts fails when a route handler is missing from it.
export const operations = [...items];
