import { Pool } from "@neondatabase/serverless";

/**
 * Puts the end-to-end test account back to "has not been through setup", and
 * afterwards back to exactly what it was. The first-time journey needs an
 * account that owes setup, and every account that existed when setup was
 * introduced owes none, the test account included.
 *
 * This is the one place a spec writes to the database directly, so it is
 * narrow on purpose:
 *
 * - It runs only against a database that is declared development and is
 *   stamped development (docs/DATABASE.md), and refuses otherwise.
 * - It touches one row, the one whose Clerk identity has the test email
 *   address, and only its setup, profile, and preference columns.
 * - While it holds the account, every other signed-in spec would be sent to
 *   setup. Run this spec by itself: `npx playwright test onboarding --workers=1`.
 *
 * If a run dies before it restores, the account is left owing setup. Running
 * the spec again puts it right: an account found owing setup is restored as
 * one that never did.
 */

const columns = `onboarding_status, onboarding_step, onboarding_completed_at, tour_state,
                 church_name, ministry_role, attends_preaching_class, locale, bible_translation`;

type Snapshot = {
  onboarding_status: string;
  onboarding_step: string;
  onboarding_completed_at: Date | null;
  tour_state: string;
  church_name: string | null;
  ministry_role: string | null;
  attends_preaching_class: boolean;
  locale: string;
  bible_translation: string | null;
};

async function developmentPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (process.env.DATABASE_ENVIRONMENT !== "development") {
    throw new Error("The onboarding spec runs against the development database only.");
  }
  const pool = new Pool({ connectionString: url });
  try {
    const stamp = await pool.query("select name from sermon_tracker_meta.environment");
    if (stamp.rows[0]?.name !== "development") {
      throw new Error("This database is not stamped development. Nothing was changed.");
    }
  } catch (error) {
    await pool.end();
    throw error;
  }
  return pool;
}

/** The Clerk identity with the test address, asked of Clerk's Backend API with the development key. */
async function clerkUserId(email: string) {
  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("The onboarding spec runs against the development Clerk instance only.");
  }
  const address = new URL("https://api.clerk.com/v1/users");
  address.searchParams.append("email_address", email);
  address.searchParams.set("limit", "2");
  const response = await fetch(address, { headers: { Authorization: `Bearer ${secretKey}` } });
  const found = response.ok ? ((await response.json()) as { id: string }[]) : [];
  if (found.length !== 1) throw new Error("The test account was not found in Clerk.");
  return found[0].id;
}

/**
 * Keeps where the product tour stands for the test account, and answers the
 * function that puts it back. The tour's own spec finishes and skips the tour,
 * which the account keeps; nothing else about the account is touched.
 */
export async function keepTourState(email: string): Promise<() => Promise<void>> {
  const pool = await developmentPool();
  try {
    const id = await clerkUserId(email);
    const found = await pool.query("select tour_state from users where clerk_user_id = $1", [id]);
    if (found.rows.length !== 1) throw new Error("The test account has no application record.");
    const was = found.rows[0].tour_state as string;
    return async () => {
      const restore = await developmentPool();
      try {
        await restore.query("update users set tour_state = $2 where clerk_user_id = $1", [id, was]);
      } finally {
        await restore.end();
      }
    };
  } finally {
    await pool.end();
  }
}

/**
 * Makes the test account one that has not been through setup, with nothing
 * said about itself. Answers the function that puts it back as it was.
 */
export async function asNewAccount(email: string): Promise<() => Promise<void>> {
  const pool = await developmentPool();
  try {
    const id = await clerkUserId(email);
    const found = await pool.query(`select ${columns} from users where clerk_user_id = $1`, [id]);
    if (found.rows.length !== 1) throw new Error("The test account has no application record.");
    const was = found.rows[0] as Snapshot;
    // Left owing setup by a run that died: it is an account that never owed any.
    const status = was.onboarding_status === "pending" ? "grandfathered" : was.onboarding_status;
    const before: Snapshot = {
      ...was,
      onboarding_status: status,
      onboarding_step: was.onboarding_status === "pending" ? "welcome" : was.onboarding_step,
      onboarding_completed_at: status === "completed" ? was.onboarding_completed_at : null,
    };

    await pool.query(
      `update users
       set onboarding_status = 'pending', onboarding_step = 'welcome', onboarding_completed_at = null,
           tour_state = 'not_offered',
           church_name = null, ministry_role = null, attends_preaching_class = false
       where clerk_user_id = $1`,
      [id],
    );

    return async () => {
      const restore = await developmentPool();
      try {
        await restore.query(
          `update users
           set onboarding_status = $2, onboarding_step = $3, onboarding_completed_at = $4,
               tour_state = $5, church_name = $6, ministry_role = $7,
               attends_preaching_class = $8, locale = $9, bible_translation = $10
           where clerk_user_id = $1`,
          [
            id,
            before.onboarding_status,
            before.onboarding_step,
            before.onboarding_completed_at,
            before.tour_state,
            before.church_name,
            before.ministry_role,
            before.attends_preaching_class,
            before.locale,
            before.bible_translation,
          ],
        );
      } finally {
        await restore.end();
      }
    };
  } finally {
    await pool.end();
  }
}
