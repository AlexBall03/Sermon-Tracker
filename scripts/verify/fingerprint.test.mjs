// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { fingerprint, parseStatus } from "./fingerprint.mjs";

describe("fingerprint", () => {
  const root = mkdtempSync(path.join(tmpdir(), "verify fingerprint "));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };

  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  git("config", "core.autocrlf", "false");
  write("src/a.ts", "a\n");
  write("src/b.ts", "b\n");
  write("docs/notes.md", "notes\n");
  write(".gitignore", "ignored/\n");
  git("add", ".");
  git("commit", "-q", "-m", "start");
  const clean = fingerprint(root);

  it("is the commit alone on a clean tree", () => {
    expect(clean).toMatchObject({ head: git("rev-parse", "HEAD").trim(), changed: 0 });
  });

  it("changes with a tracked file's content, and comes back when the change is undone", () => {
    write("src/a.ts", "a changed\n");
    const changed = fingerprint(root);
    expect(changed.hash).not.toBe(clean.hash);
    write("src/a.ts", "a changed again\n");
    expect(fingerprint(root).hash).not.toBe(changed.hash);
    write("src/a.ts", "a\n");
    expect(fingerprint(root).hash).toBe(clean.hash);
  });

  it("changes with an untracked file and its content, but not with an ignored one", () => {
    write("src/new file.ts", "one\n");
    const added = fingerprint(root);
    expect(added.hash).not.toBe(clean.hash);
    write("src/new file.ts", "two\n");
    expect(fingerprint(root).hash).not.toBe(added.hash);
    unlinkSync(path.join(root, "src/new file.ts"));
    write("ignored/x.ts", "x\n");
    expect(fingerprint(root).hash).toBe(clean.hash);
  });

  it("changes with a deletion, a staged change, and a rename", () => {
    unlinkSync(path.join(root, "src/b.ts"));
    expect(fingerprint(root).hash).not.toBe(clean.hash);
    git("checkout", "--", "src/b.ts");
    write("src/b.ts", "staged\n");
    git("add", "src/b.ts");
    expect(fingerprint(root).hash).not.toBe(clean.hash);
    git("reset", "-q", "--", "src/b.ts");
    git("checkout", "--", "src/b.ts");
    renameSync(path.join(root, "src/b.ts"), path.join(root, "src/c.ts"));
    git("add", "-A");
    expect(fingerprint(root).hash).not.toBe(clean.hash);
    git("reset", "-q", "--hard");
    expect(fingerprint(root).hash).toBe(clean.hash);
  });

  it("ignores writing: Markdown and docs", () => {
    write("docs/notes.md", "rewritten\n");
    write("README.md", "new\n");
    expect(fingerprint(root).hash).toBe(clean.hash);
    git("checkout", "--", "docs/notes.md");
    unlinkSync(path.join(root, "README.md"));
  });

  it("changes with a new commit", () => {
    write("src/a.ts", "committed\n");
    git("commit", "-q", "-am", "next");
    expect(fingerprint(root).hash).not.toBe(clean.hash);
  });
});

describe("parseStatus", () => {
  it("reads both names of a rename and names with spaces", () => {
    expect(parseStatus("R  new name.ts\0old.ts\0 M src/a.ts\0?? un tracked.ts\0")).toEqual([
      "new name.ts",
      "old.ts",
      "src/a.ts",
      "un tracked.ts",
    ]);
  });
});
