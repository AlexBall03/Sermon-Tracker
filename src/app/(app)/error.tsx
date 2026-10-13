"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { StatusPage } from "@/components/layout/status-page";
import { Button, buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { routes } from "@/lib/site";

/**
 * Error boundary for application pages. Details stay in the server log; the
 * reference is only the hash that finds them there.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useT("navigation").error;
  return (
    <StatusPage
      role="alert"
      icon={TriangleAlert}
      title={t.title}
      body={t.detail}
      note={
        error.digest && (
          <>
            {t.reference}: <span className="font-mono select-all">{error.digest}</span>
          </>
        )
      }
    >
      <Button onClick={() => retry()}>{t.retry}</Button>
      <Link href={routes.dashboard} className={buttonVariants({ variant: "outline" })}>
        {t.dashboard}
      </Link>
    </StatusPage>
  );
}
