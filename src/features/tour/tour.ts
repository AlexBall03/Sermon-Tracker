import { and, eq, inArray, ne } from "drizzle-orm";

import { users } from "@/db/schema";
import type { Database } from "@/db/types";

/*
 * Writing where the product tour stands for an account. Each write is one
 * statement on the caller's own row with everything it depends on in its
 * WHERE clause, as first-time setup's are (features/onboarding/onboarding.ts):
 * two tabs, two devices, or one request sent twice cannot disagree, and a
 * stale request matches no row and changes nothing.
 *
 * - `offerTour`: `not_offered` to `offered`, only for an account that finished setup.
 * - `dismissTour`: `not_offered` or `offered` to `dismissed`.
 * - `completeTour`: anything but `completed` to `completed`.
 *
 * So the state only ever moves on: a dismissed tour can still be completed by
 * running it again, and a completed one stays completed. Nothing here touches
 * any other column, and nothing here is called by first-time setup.
 */

type Writer = Pick<Database, "update">;

/** True when the row was changed by this call. */
async function changed(rows: Promise<{ id: string }[]>) {
  return (await rows).length > 0;
}

/** Records that the dashboard has shown the account its invitation. */
export function offerTour(db: Writer, userId: string): Promise<boolean> {
  return changed(
    db
      .update(users)
      .set({ tourState: "offered" })
      .where(
        and(
          eq(users.id, userId),
          eq(users.onboardingStatus, "completed"),
          eq(users.tourState, "not_offered"),
        ),
      )
      .returning({ id: users.id }),
  );
}

/** Records "Maybe Later", or a tour skipped before its end. A finished tour is left finished. */
export function dismissTour(db: Writer, userId: string): Promise<boolean> {
  return changed(
    db
      .update(users)
      .set({ tourState: "dismissed" })
      .where(and(eq(users.id, userId), inArray(users.tourState, ["not_offered", "offered"])))
      .returning({ id: users.id }),
  );
}

/** Records that the account went through the tour to its end. */
export function completeTour(db: Writer, userId: string): Promise<boolean> {
  return changed(
    db
      .update(users)
      .set({ tourState: "completed" })
      .where(and(eq(users.id, userId), ne(users.tourState, "completed")))
      .returning({ id: users.id }),
  );
}
