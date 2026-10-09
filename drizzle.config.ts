import { defineConfig } from "drizzle-kit";

// Used only to generate migration files from the schema (`npm run db:generate`).
// Applying them goes through scripts/db/cli.mjs, which checks the target first.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
