"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { removeScreenshot } from "../actions";
import { attachmentTypes, supportLimits } from "../model";

export type Picked = {
  /** The browser's own key, until the server gives the upload an ID. */
  key: string;
  name: string;
  preview: string;
  id: string | null;
  state: "uploading" | "done";
};

const megabytes = supportLimits.attachmentBytes / (1024 * 1024);

/**
 * Screenshots for a message being written. Each is uploaded as soon as it is
 * chosen, so sending the message only names them; one taken off again is
 * deleted. The browser's checks of type and size only save a wasted upload:
 * the server reads the file's own bytes and decides.
 */
export function ScreenshotPicker({
  available,
  picked,
  onChange,
}: {
  available: boolean;
  picked: Picked[];
  onChange: (update: (was: Picked[]) => Picked[]) => void;
}) {
  const t = useT("support").attachments;
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Previews are the browser's memory: given back when the form goes.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const held = previews.current;
    return () => held.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  if (!available) {
    return (
      <div>
        <p className="text-sm font-medium">{t.label}</p>
        <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{t.unavailable}</p>
      </div>
    );
  }

  async function upload(file: File, key: string) {
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/support/attachments", { method: "POST", body });
      const answer = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok || !answer.id) throw new Error(answer.message || t.failed);
      onChange((was) =>
        was.map((item) => (item.key === key ? { ...item, id: answer.id!, state: "done" } : item)),
      );
    } catch (error) {
      setProblem(error instanceof Error && error.message ? error.message : t.failed);
      onChange((was) => was.filter((item) => item.key !== key));
    }
  }

  function choose(files: FileList | null) {
    setProblem(null);
    if (!files) return;
    const room = supportLimits.attachments - picked.length;
    const chosen = Array.from(files);
    if (chosen.length > room) setProblem(t.tooMany(supportLimits.attachments));
    for (const file of chosen.slice(0, Math.max(0, room))) {
      if (!(attachmentTypes as readonly string[]).includes(file.type)) {
        setProblem(t.wrongType);
        continue;
      }
      if (file.size > supportLimits.attachmentBytes) {
        setProblem(t.tooLarge(megabytes));
        continue;
      }
      const key = crypto.randomUUID();
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      onChange((was) => [...was, { key, name: file.name, preview, id: null, state: "uploading" }]);
      void upload(file, key);
    }
    if (input.current) input.current.value = "";
  }

  function remove(item: Picked) {
    onChange((was) => was.filter((other) => other.key !== item.key));
    if (item.id) void removeScreenshot(item.id).catch(() => undefined);
  }

  return (
    <div>
      <p id="screenshots-label" className="text-sm font-medium">
        {t.label}
      </p>
      <p id="screenshots-hint" className="mt-1.5 text-[0.8125rem] text-muted-foreground">
        {t.hint(supportLimits.attachments, megabytes)}
      </p>
      {picked.length > 0 && (
        <ul aria-labelledby="screenshots-label" className="mt-3 flex flex-wrap gap-3">
          {picked.map((item, index) => (
            <li
              key={item.key}
              className="relative size-24 overflow-hidden rounded-lg border bg-muted shadow-card"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, not a served image */}
              <img src={item.preview} alt={t.alt(index + 1)} className="size-full object-cover" />
              {item.state === "uploading" && (
                <span className="absolute inset-0 grid place-items-center bg-background/70">
                  <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-hidden />
                  <span className="sr-only">{t.uploading}</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label={t.remove(item.name)}
                className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-background/90 text-foreground shadow-card transition-colors hover:bg-background pointer-coarse:size-9"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked.length < supportLimits.attachments && (
        <>
          <input
            ref={input}
            id="screenshots"
            type="file"
            accept={attachmentTypes.join(",")}
            multiple
            className="sr-only"
            aria-describedby="screenshots-hint"
            onChange={(event) => choose(event.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => input.current?.click()}
          >
            <ImagePlus aria-hidden />
            {t.add}
          </Button>
        </>
      )}
      <p
        role="status"
        aria-live="polite"
        className={problem ? "mt-2 text-[0.8125rem] font-medium text-destructive" : "sr-only"}
      >
        {problem}
      </p>
    </div>
  );
}
