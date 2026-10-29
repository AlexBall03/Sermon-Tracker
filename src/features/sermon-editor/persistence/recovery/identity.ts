/*
 * A stored record's exact identity (A2.3C): whether the record in IndexedDB
 * now is the record the person reviewed. Resolution removes or restores a
 * draft only while this says `equal`, inside the transaction that does it,
 * so an approval given for one record never acts on another written since
 * under the same key.
 *
 * Conservative by design. It compares only values it can compare exactly:
 * primitives (`Object.is`, so -0 and NaN are themselves), plain objects (own
 * string keys, any order), dense arrays without extra properties, `Date`s,
 * `ArrayBuffer`s, and typed arrays and `DataView`s byte for byte. Anything
 * else IndexedDB can store (a `Map`, a `Set`, a `Blob`, a `RegExp`, an
 * error, a boxed primitive, …) is `unknown`, never `equal` because its type
 * matches. `unknown` refuses the action: a record whose identity cannot be
 * established is kept.
 *
 * Pure: no IndexedDB, no logging. Records hold sermon words; nothing here
 * copies or reports them.
 */

export type RecordMatch = "equal" | "different" | "unknown";

const viewTags = new Set([
  "[object Int8Array]",
  "[object Uint8Array]",
  "[object Uint8ClampedArray]",
  "[object Int16Array]",
  "[object Uint16Array]",
  "[object Int32Array]",
  "[object Uint32Array]",
  "[object Float32Array]",
  "[object Float64Array]",
  "[object BigInt64Array]",
  "[object BigUint64Array]",
  "[object DataView]",
]);

const tagOf = (value: object) => Object.prototype.toString.call(value);

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return (proto === Object.prototype || proto === null) && tagOf(value) === "[object Object]";
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let index = 0; index < a.byteLength; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

const asBytes = (view: ArrayBufferView) =>
  new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

/** Whether two stored values are the same record: `unknown` when that cannot be said exactly. */
export function sameRecord(a: unknown, b: unknown, depth = 0): RecordMatch {
  // Records this deep are not drafts this code wrote; nothing is said of them.
  if (depth > 512) return "unknown";
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    if (typeof a === "function" || typeof b === "function") return "unknown";
    return Object.is(a, b) ? "equal" : "different";
  }
  const tag = tagOf(a);
  if (tag !== tagOf(b)) return "different";

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return "different";
    const keys = Object.keys(a);
    if (keys.length !== a.length || Object.keys(b).length !== b.length) return "unknown";
    let result: RecordMatch = "equal";
    for (let index = 0; index < a.length; index += 1) {
      const item = sameRecord(a[index], b[index], depth + 1);
      if (item === "different") return "different";
      if (item === "unknown") result = "unknown";
    }
    return result;
  }
  if (tag === "[object Date]") {
    return Object.is((a as Date).getTime(), (b as Date).getTime()) ? "equal" : "different";
  }
  if (tag === "[object ArrayBuffer]") {
    return bytesEqual(new Uint8Array(a as ArrayBuffer), new Uint8Array(b as ArrayBuffer))
      ? "equal"
      : "different";
  }
  if (viewTags.has(tag)) {
    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return "different";
    return bytesEqual(asBytes(a as ArrayBufferView), asBytes(b as ArrayBufferView))
      ? "equal"
      : "different";
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    if (Object.getOwnPropertySymbols(a).length || Object.getOwnPropertySymbols(b).length) {
      return "unknown";
    }
    const keys = Object.keys(a);
    const other = Object.keys(b);
    if (keys.length !== other.length) return "different";
    let result: RecordMatch = "equal";
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return "different";
      const item = sameRecord(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        depth + 1,
      );
      if (item === "different") return "different";
      if (item === "unknown") result = "unknown";
    }
    return result;
  }
  // A type this code does not compare exactly: never equal because the tags match.
  return "unknown";
}
