"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";

import type { ActionResult } from "@/lib/action-result";
import { describeAccountError } from "../clerk-errors";

/** The signed-in identity as the sign-in provider's browser SDK exposes it. */
export type AccountUser = NonNullable<ReturnType<typeof useUser>["user"]>;

type Task = () => Promise<ActionResult | void>;

/** Runs an account operation and turns whatever happens into a user-safe result. */
export async function attempt(task: Task, success: string, failure: string): Promise<ActionResult> {
  try {
    return (await task()) ?? { ok: true, message: success };
  } catch (error) {
    return { ok: false, message: describeAccountError(error, failure) };
  }
}

/** Busy and result state for one block of account controls. */
export function useAccountAction() {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(task: Task, success = "", failure = "That could not be done. Try again.") {
    setBusy(true);
    setResult(null);
    const outcome = await attempt(task, success, failure);
    setResult(outcome);
    setBusy(false);
    return outcome;
  }

  return { busy, result, run, setResult };
}
