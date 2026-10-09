"use client";

import { Button } from "@/components/ui/button";

/** Error boundary for application pages. Details stay in the server log. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-page py-16">
      <div role="alert" className="mx-auto max-w-lg rounded-xl border bg-surface p-8 shadow-card">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          This page could not be loaded. Nothing was changed. Try again, and if it keeps happening,
          let an administrator know.
        </p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
