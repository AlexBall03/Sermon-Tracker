// The unit-test inventory and its batches (docs/TESTING.md, "Batches").
//
// The inventory is what Vitest itself discovers (`vitest list --filesOnly`),
// never a glob of ours. Every file is in exactly one batch, and a run proves
// it from Vitest's own report of which files ran.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const database = /createTestDatabase|recordingDatabase|new PGlite\(/;

/** Repository-relative, forward slashes. */
export function relative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

/** Reads `vitest list --json` output into sorted relative paths. */
export function parseList(root, json) {
  const entries = JSON.parse(json);
  if (!Array.isArray(entries)) throw new Error("vitest list did not return a list");
  const files = entries.map((e) => {
    if (typeof e?.file !== "string")
      throw new Error("vitest list returned an entry without a file");
    return relative(root, path.resolve(e.file));
  });
  return [...new Set(files)].sort();
}

export function inventoryHash(files) {
  return createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 16);
}

/** A file's weight: heavier when it opens an in-memory database. */
export function weigh(root, files, config) {
  return Object.fromEntries(
    files.map((f) => [
      f,
      database.test(readFileSync(path.join(root, f), "utf8")) ? config.databaseWeight : 1,
    ]),
  );
}

/** Sorted files, packed in order into batches of at most `config.batchWeight`. */
export function partition(files, weights, config, prefix = "unit") {
  const batches = [];
  let current = null;
  for (const file of [...files].sort()) {
    const w = weights[file] ?? 1;
    if (!current || (current.weight + w > config.batchWeight && current.files.length > 0)) {
      current = {
        id: `${prefix}-${String(batches.length + 1).padStart(2, "0")}`,
        files: [],
        weight: 0,
      };
      batches.push(current);
    }
    current.files.push(file);
    current.weight += w;
  }
  return batches;
}

/** Every file of the inventory in exactly one batch, and nothing else. */
export function validatePartition(inventory, batches) {
  const known = new Set(inventory);
  const seen = new Map();
  const duplicates = [];
  const unknown = [];
  for (const batch of batches) {
    for (const file of batch.files) {
      if (!known.has(file)) unknown.push(file);
      if (seen.has(file)) duplicates.push(file);
      seen.set(file, batch.id);
    }
  }
  const omitted = inventory.filter((f) => !seen.has(f));
  const ids = batches.map((b) => b.id);
  const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  const ok = !duplicates.length && !unknown.length && !omitted.length && !duplicateIds.length;
  return { ok, duplicates, unknown, omitted, duplicateIds };
}

/** Which planned files Vitest's report says ran, and which it ran unplanned. */
export function compareExecuted(planned, executed) {
  const ran = new Set(executed);
  const plannedSet = new Set(planned);
  return {
    missing: planned.filter((f) => !ran.has(f)),
    extra: executed.filter((f) => !plannedSet.has(f)),
  };
}
