// Pure decision logic for migration tooling. No I/O, so it is unit tested.

export const ENVIRONMENTS = ["development", "production"];

const connectionString = /postgres(?:ql)?:\/\/[^\s"'`]+/gi;

/** Removes anything that looks like a connection string from a message. */
export function redact(text) {
  return String(text).replace(connectionString, "[connection string removed]");
}

/** Host and database name only; never the user, password, or query string. */
export function describeTarget(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "(unreadable connection string)";
  }
}

/**
 * Decides whether a command aimed at `target` may touch the connected database.
 *
 * - `declared`: DATABASE_ENVIRONMENT for the connection string in use.
 * - `stamp`: the environment name stored inside the database, or null.
 * - `isEmpty`: the database has no tables at all.
 *
 * The declaration and the stamp must both agree with the target. An unstamped
 * database is accepted only for development and only while it is empty.
 */
export function checkTarget({ target, declared, stamp, isEmpty, vercelEnv }) {
  if (!ENVIRONMENTS.includes(target)) {
    return refuse(`Unknown target "${target}".`);
  }
  if (target === "development" && vercelEnv === "production") {
    return refuse("Development migrations cannot run in a production deployment.");
  }
  if (target === "production" && vercelEnv) {
    return refuse("Production migrations are run by hand from a workstation, not on Vercel.");
  }
  if (declared !== target) {
    return refuse(
      declared
        ? `The connection is declared as "${declared}", but this command targets ${target}.`
        : `DATABASE_ENVIRONMENT is not set, so the database cannot be identified.`,
    );
  }
  if (stamp === target) return { ok: true, needsStamp: false };
  if (stamp) {
    return refuse(
      `This database is stamped "${stamp}", but this command targets ${target}. Nothing was changed.`,
    );
  }
  if (target === "development" && isEmpty) return { ok: true, needsStamp: true };
  return refuse(
    `This database has no environment stamp. Run "npm run db:stamp -- ${shortName(target)}" once to identify it.`,
  );
}

/** Stamping rules: never silently relabel a production database. */
export function checkStamp({ target, stamp, force }) {
  if (!ENVIRONMENTS.includes(target)) return refuse(`Unknown target "${target}".`);
  if (stamp === target) return { ok: true, alreadyStamped: true };
  if (stamp === "production" && !force) {
    return refuse(
      'This database is stamped "production". If it really is a copy meant for development, rerun with --force.',
    );
  }
  return { ok: true, alreadyStamped: false };
}

/** Journal entries newer than the last applied migration, in order. */
export function pendingMigrations(journalEntries, lastAppliedMillis) {
  return journalEntries
    .filter((entry) => lastAppliedMillis === null || entry.when > lastAppliedMillis)
    .map((entry) => entry.tag);
}

export function resolveTarget(name) {
  if (name === "dev" || name === "development") return "development";
  if (name === "prod" || name === "production") return "production";
  return null;
}

function shortName(target) {
  return target === "production" ? "prod" : "dev";
}

function refuse(reason) {
  return { ok: false, reason };
}
