import { drizzle } from "drizzle-orm/d1";
import { councils, councilTurns } from "./generated/index";

// The `schema` object is exported for table references (queries.ts destructures
// councils/councilTurns from it), but it is NOT passed to drizzle(): passing it
// makes `Db` schema-BOUND, which is not assignable to the schema-agnostic `Db` type
// the codegen'd finders (Council.queries.ts etc.) accept — a schema-less db keeps
// the generated finders composable. This app only uses the explicit
// `.select().from(table)` builder, never the relational query API (`db.query.*`),
// which is the one thing `{ schema }` would enable. Add `{ schema }` back only if
// you adopt `db.query.*`, and cast at the finder call sites if you do.
const schema = { councils, councilTurns };

export function getDb(env: { DB: D1Database }) {
  return drizzle(env.DB);
}

export type Db = ReturnType<typeof getDb>;
export { schema };
