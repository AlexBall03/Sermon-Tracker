// What a verification result was run on (docs/TESTING.md, "Results").
//
// HEAD, plus the content of every path git reports as different from it
// (modified, staged, deleted, renamed, or untracked and not ignored). That is
// the whole working tree at the cost of hashing only what changed. Writing
// (`*.md`, `docs/`) cannot change a test's result and is left out, so a
// handoff can be written without making a finished run stale.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

export function irrelevant(file) {
  return file.endsWith(".md") || file.startsWith("docs/") || file.startsWith(".verify/");
}

/** Paths from `git status --porcelain=v1 -z`, renames giving both names. */
export function parseStatus(output) {
  const fields = output.split("\0").filter(Boolean);
  const paths = [];
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i];
    const code = entry.slice(0, 2);
    paths.push(entry.slice(3));
    // A rename or copy is followed by its original path.
    if (code.includes("R") || code.includes("C")) paths.push(fields[++i]);
  }
  return [...new Set(paths)].sort();
}

const git = (root, args, input) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });

export function fingerprint(root) {
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  const changed = parseStatus(
    git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  ).filter((f) => !irrelevant(f));
  const present = changed.filter((f) => existsSync(path.join(root, f)));
  const blobs = present.length
    ? git(root, ["hash-object", "--no-filters", "--stdin-paths"], present.join("\n") + "\n")
        .trim()
        .split("\n")
    : [];
  const byPath = new Map(present.map((f, i) => [f, blobs[i]]));
  const lines = changed.map((f) => `${f}\t${byPath.get(f) ?? "deleted"}`);
  const hash = createHash("sha256")
    .update(`${head}\n${lines.join("\n")}`)
    .digest("hex")
    .slice(0, 16);
  return { head, changed: changed.length, hash };
}
