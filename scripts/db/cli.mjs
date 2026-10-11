// Database commands: migrate, stamp, status. See docs/DATABASE.md.
//
//   node scripts/db/cli.mjs migrate dev|prod|deploy
//   node scripts/db/cli.mjs stamp   dev|prod [--force]
//   node scripts/db/cli.mjs status  dev|prod
//
// `migrate deploy` is the build step: it migrates production inside the Vercel
// production deployment, without a prompt, and does nothing anywhere else.
//
// `migrate` also loads the King James Bible and the titles of the Psalms
// (seed-bible.mjs) when the database does not already hold the committed edition
// of each.
//
// Every command identifies its target before changing anything and refuses
// when the identity is missing or does not match (see guard.mjs).

import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

import {
  checkStamp,
  checkTarget,
  describeTarget,
  pendingMigrations,
  redact,
  resolveTarget,
} from "./guard.mjs";
import { readDataset, readPsalmTitles } from "../bible/dataset.mjs";
import {
  bibleIsCurrent,
  psalmTitlesAreCurrent,
  seedBible,
  seedPsalmTitles,
} from "./seed-bible.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const migrationsFolder = `${root}drizzle`;

class Refusal extends Error {}

function loadEnvFile(name) {
  const path = `${root}${name}`;
  // Values already present in the shell win over the file.
  if (existsSync(path)) process.loadEnvFile(path);
}

/**
 * Connection settings for a target. From a workstation, production never
 * reads DATABASE_URL. The production deployment has only its own DATABASE_URL,
 * and the guard checks that it is declared and stamped as production.
 */
function connectionFor(target, automated) {
  if (automated) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Refusal(
        "DATABASE_URL is not set for the Production environment in Vercel (see docs/ENVIRONMENTS.md).",
      );
    }
    return { url, declared: process.env.DATABASE_ENVIRONMENT || undefined };
  }
  if (target === "production") {
    loadEnvFile(".env.production.local");
    const url = process.env.PRODUCTION_DATABASE_URL;
    if (!url) {
      throw new Refusal(
        "PRODUCTION_DATABASE_URL is not set. Provide it in the shell or in .env.production.local (git-ignored).",
      );
    }
    return { url, declared: "production" };
  }
  loadEnvFile(".env.local");
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Refusal(
      'DATABASE_URL is not set. Add it to .env.local (see docs/ENVIRONMENTS.md), or use "npm run dev:next" to work on the interface without a database.',
    );
  }
  return { url, declared: process.env.DATABASE_ENVIRONMENT || undefined };
}

async function readStamp(pool) {
  const exists = await pool.query(
    "select to_regclass('sermon_tracker_meta.environment') is not null as present",
  );
  if (!exists.rows[0].present) return null;
  const result = await pool.query("select name from sermon_tracker_meta.environment");
  return result.rows[0]?.name ?? null;
}

async function writeStamp(pool, target) {
  await pool.query("create schema if not exists sermon_tracker_meta");
  await pool.query(
    `create table if not exists sermon_tracker_meta.environment (
       singleton boolean primary key default true check (singleton),
       name text not null,
       stamped_at timestamptz not null default now()
     )`,
  );
  await pool.query(
    `insert into sermon_tracker_meta.environment (name) values ($1)
     on conflict (singleton) do update set name = excluded.name, stamped_at = now()`,
    [target],
  );
}

async function isEmptyDatabase(pool) {
  const result = await pool.query(
    `select count(*)::int as tables from information_schema.tables
     where table_schema not in ('pg_catalog', 'information_schema')
       and table_schema not like 'pg\\_%'`,
  );
  return result.rows[0].tables === 0;
}

async function readPending(pool) {
  const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8"));
  const exists = await pool.query(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as present",
  );
  let last = null;
  if (exists.rows[0].present) {
    const result = await pool.query(
      "select max(created_at) as last from drizzle.__drizzle_migrations",
    );
    last = result.rows[0].last === null ? null : Number(result.rows[0].last);
  }
  return { pending: pendingMigrations(journal.entries, last), total: journal.entries.length };
}

async function confirm(phrase) {
  if (!process.stdin.isTTY) {
    throw new Refusal(
      "This command needs confirmation and must be run in an interactive terminal.",
    );
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question(`Type "${phrase}" to continue: `);
    if (answer.trim() !== phrase)
      throw new Refusal("Confirmation did not match. Nothing was changed.");
  } finally {
    prompt.close();
  }
}

async function inspect(pool, target, declared) {
  const [stamp, isEmpty] = [await readStamp(pool), await isEmptyDatabase(pool)];
  const verdict = checkTarget({
    target,
    declared,
    stamp,
    isEmpty,
    vercelEnv: process.env.VERCEL_ENV || undefined,
  });
  return { stamp, verdict };
}

/** Loads reference data on one connection, since each load is a transaction. */
async function load(pool, seed, data) {
  const client = await pool.connect();
  try {
    await seed(client, data);
  } finally {
    client.release();
  }
}

async function runMigrate(pool, target, { url, declared }, automated) {
  const { verdict } = await inspect(pool, target, declared);
  if (!verdict.ok) throw new Refusal(verdict.reason);

  const { pending } = await readPending(pool);
  const books = readDataset();
  const bibleCurrent = await bibleIsCurrent(pool, books);
  const titles = readPsalmTitles();
  const titlesCurrent = await psalmTitlesAreCurrent(pool, titles);
  const upToDate = pending.length === 0 && bibleCurrent && titlesCurrent;

  if (target === "production") {
    console.log(`Target:   PRODUCTION  ${describeTarget(url)}`);
    console.log(
      pending.length
        ? `Pending:  ${pending.length}\n${pending.map((tag) => `  - ${tag}`).join("\n")}`
        : "Pending:  none",
    );
    console.log(`Bible:    ${bibleCurrent ? "loaded" : "to be loaded"}`);
    console.log(`Titles:   ${titlesCurrent ? "loaded" : "to be loaded"}`);
    if (upToDate) return;
    if (pending.length) console.log("Migrations are not rolled back automatically if one fails.");
    // A deployment has no terminal; pushing to the production branch is the confirmation.
    if (!automated) await confirm("migrate production");
  } else if (upToDate) {
    console.log("Database: development, up to date.");
    return;
  }

  if (verdict.needsStamp) await writeStamp(pool, target);
  if (pending.length) {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
    console.log(`Database: applied ${pending.length} migration(s) to ${target}.`);
  }
  if (!bibleCurrent) {
    await load(pool, seedBible, books);
    console.log(`Database: loaded the King James Bible into ${target}.`);
  }
  // After the migrations: the table the titles go in is one of them.
  if (!titlesCurrent) {
    await load(pool, seedPsalmTitles, titles);
    console.log(`Database: loaded the titles of the Psalms into ${target}.`);
  }
}

async function runStamp(pool, target, { url }, force) {
  const stamp = await readStamp(pool);
  const verdict = checkStamp({ target, stamp, force });
  if (!verdict.ok) throw new Refusal(verdict.reason);
  console.log(`Target:        ${describeTarget(url)}`);
  console.log(`Current stamp: ${stamp ?? "(none)"}`);
  if (verdict.alreadyStamped) {
    console.log(`Already stamped ${target}. Nothing to do.`);
    return;
  }
  await confirm(`stamp ${target}`);
  await writeStamp(pool, target);
  console.log(`Stamped as ${target}.`);
}

async function runStatus(pool, target, { url, declared }) {
  const { stamp, verdict } = await inspect(pool, target, declared);
  const { pending, total } = await readPending(pool);
  console.log(`Target:     ${describeTarget(url)}`);
  console.log(`Declared:   ${declared ?? "(not set)"}`);
  console.log(`Stamp:      ${stamp ?? "(none)"}`);
  console.log(`Migrations: ${total - pending.length} applied, ${pending.length} pending`);
  for (const tag of pending) console.log(`  - ${tag}`);
  console.log(
    `Bible:      ${(await bibleIsCurrent(pool, readDataset())) ? "loaded" : "not loaded"}`,
  );
  console.log(
    `Titles:     ${(await psalmTitlesAreCurrent(pool, readPsalmTitles())) ? "loaded" : "not loaded"}`,
  );
  console.log(verdict.ok ? "Check:      ok" : `Check:      refused. ${verdict.reason}`);
}

async function main() {
  const [command, targetName, ...flags] = process.argv.slice(2);
  const automated = command === "migrate" && targetName === "deploy";
  if (automated && process.env.VERCEL_ENV !== "production") {
    console.log("Database: not a production deployment, migrations skipped.");
    return;
  }
  // `status` is read-only, so it defaults to development.
  const target = automated
    ? "production"
    : resolveTarget(targetName ?? (command === "status" ? "dev" : undefined));
  if (!["migrate", "stamp", "status"].includes(command) || !target) {
    throw new Refusal(
      "Usage: node scripts/db/cli.mjs <migrate|stamp|status> <dev|prod> [--force], or migrate deploy",
    );
  }

  const connection = connectionFor(target, automated);
  const pool = new Pool({ connectionString: connection.url });
  try {
    if (command === "migrate") await runMigrate(pool, target, connection, automated);
    if (command === "stamp") await runStamp(pool, target, connection, flags.includes("--force"));
    if (command === "status") await runStatus(pool, target, connection);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const prefix = error instanceof Refusal ? "Refused" : "Database command failed";
  console.error(`\n${prefix}: ${redact(error?.message ?? error)}\n`);
  process.exit(1);
});
