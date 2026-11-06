// Resource policy of the verification coordinator (docs/TESTING.md, "Resource policy").
//
// Every number is a measurement on the development machine (14 GB, 16 threads,
// Windows 11), recorded in docs/HANDOFF-TEST-INFRA.md, with room above it.
// Override one for a run with `--<name>=<MB>` (e.g. `--reserve-mb=1500`) or in
// the environment as VERIFY_<NAME> (e.g. VERIFY_RESERVE_MB=1500).

export const defaults = {
  // Physical memory always left free for the system and the developer's own applications.
  reserveMb: 1024,
  // Below either of these while a job runs, the job is stopped (resource_exhausted).
  criticalFreeMb: 350,
  criticalCommitFreeMb: 1536,
  // How long a job waits for memory to come back before it is not started.
  admitWaitMs: 180_000,
  // How often memory is read while a job runs.
  sampleMs: 2_000,
  // Vitest workers: never more than this, and only as many as free memory allows.
  maxWorkers: 2,
  // A batch is a checkpoint for resuming and for checking memory again; files that
  // open an in-memory database (about 240 MB each while open) weigh more.
  batchWeight: 40,
  databaseWeight: 3,
};

// Peak working set of each kind of job, in MB, measured on 6 November 2026 with
// some room above (docs/HANDOFF-TEST-INFRA.md): the highest Vitest batch with two
// workers 1,693; `next build` 2,780; `next start` 351; `next dev` 2,738 by the
// end of the lab suite (it grows as it compiles routes); one browser unit 1,359.
export const needs = {
  vitestMain: 300,
  vitestWorker: 1400,
  nextBuild: 3000,
  nextStart: 500,
  nextDev: 2800,
  browser: 1400,
  static: 1500,
};

const envName = (key) => `VERIFY_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`;
const flagName = (key) => `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}=`;

/** The policy in force: defaults, then the environment, then flags. */
export function resolveConfig(argv = [], env = process.env) {
  const config = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const fromEnv = env[envName(key)];
    const flag = argv.find((a) => a.startsWith(flagName(key)));
    const raw = flag ? flag.slice(flagName(key).length) : fromEnv;
    if (raw === undefined) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${key} must be a number: ${raw}`);
    config[key] = value;
  }
  return config;
}

/** How many Vitest workers fit in `freeMb` (0: not even one). */
export function workersFor(freeMb, config) {
  const room = freeMb - config.reserveMb - needs.vitestMain;
  return Math.max(0, Math.min(config.maxWorkers, Math.floor(room / needs.vitestWorker)));
}
