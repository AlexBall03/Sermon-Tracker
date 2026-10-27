import type { DocumentProblem } from "@/features/sermon-editor/document";

/*
 * The strict JSON copy of a sermon document (A2.3A.1): what a save sends and
 * what the server accepts before the schema is asked. Pure; the browser and
 * the server use the same function.
 *
 * `JSON.stringify` changes some values without a word (`NaN` becomes `null`,
 * an `undefined` property disappears, a `Date` becomes a string), and
 * PostgreSQL's `jsonb` refuses text holding U+0000 or an unpaired surrogate.
 * This copy refuses all of those instead, with the path of the first one, so
 * what is saved is exactly what was written or nothing. It checks only that
 * a value is JSON and storable; whether it is a sermon document is the
 * core's (`restoreSermonDocument`).
 *
 * The one change it makes: `-0` is written as `0`, which JSON cannot tell
 * apart and which compares equal.
 */

/** A JSON value as `jsonb` stores it. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type JsonProblem = DocumentProblem & {
  code: "not_json" | "unstorable_text";
  /** Where, as `/content/0/attrs/page`: the document's own path style. */
  path: string;
  /** What was found: a kind, never the value or any of the text. */
  detail: string;
};

export type PlainJson = { ok: true; value: JsonValue } | { ok: false; problem: JsonProblem };

/** U+0000, or a surrogate without its partner. */
const unstorable = /\u0000|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

function textProblem(text: string): string | null {
  if (text.includes("\u0000")) return "nul";
  const wellFormed =
    typeof text.isWellFormed === "function" ? text.isWellFormed() : !unstorable.test(text);
  return wellFormed ? null : "unpaired_surrogate";
}

class Refusal {
  constructor(readonly problem: JsonProblem) {}
}

const pointer = (path: string, key: string | number) =>
  `${path}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`;

/**
 * A plain copy of `value` (every object with `Object.prototype`, as a Server
 * Action requires), or the first thing in it that JSON or `jsonb` would not
 * keep exactly. Objects with a null prototype, as ProseMirror's attributes
 * are, are copied like any other.
 */
export function toPlainJson(value: unknown): PlainJson {
  const ancestors = new Set<object>();
  const refuse = (path: string, code: JsonProblem["code"], detail: string): never => {
    throw new Refusal({ code, path, detail });
  };

  const copy = (current: unknown, path: string): JsonValue => {
    switch (typeof current) {
      case "string": {
        const problem = textProblem(current);
        if (problem) refuse(path, "unstorable_text", problem);
        return current;
      }
      case "number":
        if (!Number.isFinite(current)) refuse(path, "not_json", String(current));
        return current === 0 ? 0 : current;
      case "boolean":
        return current;
      case "object":
        break;
      default:
        // undefined, a function, a symbol, or a BigInt.
        return refuse(path, "not_json", typeof current);
    }
    if (current === null) return null;
    if (ancestors.has(current)) refuse(path, "not_json", "cycle");
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        if (Object.keys(current).length !== current.length) {
          // A hole, which JSON writes as null, or a property it would drop.
          refuse(path, "not_json", "array_shape");
        }
        return current.map((item, index) => copy(item, pointer(path, index)));
      }
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        refuse(path, "not_json", (prototype?.constructor?.name as string | undefined) || "object");
      }
      if (Object.getOwnPropertySymbols(current).length > 0) refuse(path, "not_json", "symbol_key");
      const out: { [key: string]: JsonValue } = {};
      for (const key of Object.keys(current)) {
        const at = pointer(path, key);
        const keyProblem = textProblem(key);
        if (keyProblem) refuse(at, "unstorable_text", `key_${keyProblem}`);
        const item = copy((current as Record<string, unknown>)[key], at);
        // A key named `__proto__` is kept as a property, as `JSON.parse` keeps it.
        Object.defineProperty(out, key, {
          value: item,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return out;
    } finally {
      ancestors.delete(current);
    }
  };

  try {
    return { ok: true, value: copy(value, "") };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, problem: error.problem };
    // Nesting deeper than the stack: not a document anyone wrote.
    if (error instanceof RangeError) {
      return { ok: false, problem: { code: "not_json", path: "", detail: "depth" } };
    }
    throw error;
  }
}
