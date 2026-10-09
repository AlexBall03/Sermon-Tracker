import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Application roles and account statuses. Stored as text with CHECK
 * constraints so a new value is an ordinary migration.
 */
export const userRoles = ["admin", "user"] as const;
export type UserRole = (typeof userRoles)[number];

export const userStatuses = ["active", "disabled"] as const;
export type UserStatus = (typeof userStatuses)[number];

/** One row per person allowed into the application. Clerk owns the identity. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    role: text("role", { enum: userRoles }).notNull().default("user"),
    status: text("status", { enum: userStatuses }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("users_role_check", sql`${table.role} in ('admin', 'user')`),
    check("users_status_check", sql`${table.status} in ('active', 'disabled')`),
  ],
);

export type AppUser = typeof users.$inferSelect;
