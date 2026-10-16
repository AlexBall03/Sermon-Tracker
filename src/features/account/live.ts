import "server-only";

import { deleteIdentity } from "@/features/admin/clerk";
import { deleteScreenshots } from "@/features/support/blob";
import type { DeletionDeps } from "./deletion";

/** The real services an account deletion removes things from. Tests pass their own. */
export const liveDeletionDeps: DeletionDeps = {
  deleteBlobs: deleteScreenshots,
  deleteIdentity,
};
