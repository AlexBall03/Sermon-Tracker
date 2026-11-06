// Records, in order, what the lifecycle fixtures see (read by src/db/test-lifecycle.test.ts).
import { appendFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";

const names = new WeakMap<object, string>();
const file = process.env.LIFECYCLE_LOG ?? "";

export function log(line: string) {
  if (file) appendFileSync(file, `${line}\n`);
}

/** Names the database (its PGlite client) for the log. */
export function name(db: object, label: string) {
  names.set((db as { $client: object }).$client, label);
}

// Every close of a named database is logged, whoever closes it. PGlite also
// closes a temporary instance of its own while it starts; that one has no name.
const close = PGlite.prototype.close;
PGlite.prototype.close = async function (this: PGlite) {
  const label = names.get(this);
  if (label) log(`close ${label}`);
  return close.call(this);
};
