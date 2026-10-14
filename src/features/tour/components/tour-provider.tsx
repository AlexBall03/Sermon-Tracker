"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useReading } from "@/features/preferences/client";
import { translations as translationNames } from "@/features/scripture/translations";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { completeProductTour, dismissProductTour } from "../actions";
import { dashboardSections, type DashboardSection } from "../model";
import { tourSteps } from "../steps";

/*
 * The product tour, over the real application. One for the whole shell: it
 * lives above the pages, so it carries on while the router moves between
 * them, and the page beneath is the page itself, never a drawing of it.
 *
 * Starting it writes nothing. Ending it is the one write, made in passing: a
 * tour followed to its end is `completed`, one skipped is `dismissed` (a
 * finished tour stays finished: features/tour/tour.ts). The step it is on is
 * this component's and nobody else's.
 */

type Tour = {
  /** Begins the tour at its first stop, on the dashboard. */
  start: () => void;
  running: boolean;
};

const TourContext = createContext<Tour>({ start: () => {}, running: false });

/** Starting the tour, from the dashboard's invitation or from Settings. */
export function useTour(): Tour {
  return useContext(TourContext);
}

type Run = { index: number; open: boolean };

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [run, setRun] = useState<Run | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const start = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRun({ index: 0, open: true });
  }, []);

  const end = useCallback((how: "skipped" | "finished") => {
    setRun((current) => current && { ...current, open: false });
    // The tour has ended on screen whatever the answer; a lost one only means it may be offered again.
    void (how === "finished" ? completeProductTour() : dismissProductTour()).catch(() => {});
  }, []);

  const value = useMemo(() => ({ start, running: run !== null }), [start, run]);

  return (
    <TourContext value={value}>
      {children}
      {run && (
        <TourOverlay
          index={run.index}
          open={run.open}
          onStep={(index) => setRun({ index, open: true })}
          onEnd={end}
          onClosed={() => setRun(null)}
          opener={opener}
        />
      )}
    </TourContext>
  );
}

/** Tailwind's `md`, where the bar's link row takes over from the tab bar. */
const wideQuery = "(min-width: 48rem)";
const subscribeWide = (change: () => void) => {
  const query = window.matchMedia(wideQuery);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
const useWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(wideQuery).matches,
    () => true,
  );

/** How long a step waits for what it points at before it is shown without it. */
const lookMs = 3000;
/** How long it waits for the name it prefers before it settles for another. */
const fallbackMs = 1500;
/** How long it waits for its page before it is shown anyway. */
const arriveMs = 8000;
/** Room between what is pointed out and the edge of its light. */
const pad = 6;

type Box = { top: number; left: number; width: number; height: number };
type Found = { index: number; element: HTMLElement | null; sections: DashboardSection[] };

const visible = (element: HTMLElement | null): element is HTMLElement =>
  !!element && element.getClientRects().length > 0;

/** The element's box, padded, and kept inside the window: a tall section is lit as far as is seen. */
function measure(element: HTMLElement): Box {
  const r = element.getBoundingClientRect();
  const top = Math.max(r.top - pad, pad);
  const left = Math.max(r.left - pad, pad);
  const bottom = Math.min(r.bottom + pad, window.innerHeight - pad);
  const right = Math.min(r.right + pad, window.innerWidth - pad);
  return { top, left, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) };
}

function TourOverlay({
  index,
  open,
  onStep,
  onEnd,
  onClosed,
  opener,
}: {
  index: number;
  open: boolean;
  onStep: (index: number) => void;
  onEnd: (how: "skipped" | "finished") => void;
  onClosed: () => void;
  opener: React.RefObject<HTMLElement | null>;
}) {
  const t = useT("tour");
  const pathname = usePathname();
  const router = useRouter();
  const wide = useWide();
  const { translations } = useReading();
  const step = tourSteps[index];
  const last = index === tourSteps.length - 1;
  const here = pathname === step.href;

  const [found, setFound] = useState<Found | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const ready = found?.index === index;
  const target = ready ? found.element : null;

  // Each stop is a page of the application, reached with its own router.
  useEffect(() => {
    if (!here) router.push(step.href);
  }, [here, router, step.href]);

  // A page that never arrives (an error, a refusal) does not hold the tour: the step is shown anyway.
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setFound((current) =>
          current?.index === index ? current : { index, element: null, sections: [] },
        ),
      arriveMs,
    );
    return () => window.clearTimeout(timer);
  }, [index]);

  // On the page, find what the step points at: the first of its names that is there and seen.
  useEffect(() => {
    if (!here) return;
    const names = wide ? step.wide : step.narrow;
    const began = performance.now();
    let frame = 0;
    const look = () => {
      const waited = performance.now() - began;
      // The first name is the one meant; another is taken only once the page has had time to
      // show it (a page still loading shows its skeleton, while the bar's links are already there).
      const element =
        names
          .slice(0, waited > fallbackMs ? undefined : 1)
          .map((name) => document.querySelector<HTMLElement>(`[data-tour="${name}"]`))
          .find(visible) ?? null;
      if (element || names.length === 0 || waited > lookMs) {
        const sections =
          step.id === "dashboard"
            ? dashboardSections.filter((name) =>
                visible(document.querySelector(`[data-tour="${name}"]`)),
              )
            : [];
        setFound({ index, element, sections });
        return;
      }
      frame = requestAnimationFrame(look);
    };
    frame = requestAnimationFrame(look);
    return () => cancelAnimationFrame(frame);
  }, [here, index, step, wide]);

  // The light follows what it points at as the window changes.
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setBox(measure(target)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(target);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [target]);

  // Focus stays on the way forward, whatever changed under it.
  useEffect(() => {
    if (!popupRef.current?.contains(document.activeElement)) nextRef.current?.focus();
  }, [index]);

  const spot = target ? box : null;
  const next = () => {
    if (!ready) return;
    if (last) onEnd("finished");
    else onStep(index + 1);
  };
  const back = () => {
    if (ready && index > 0) onStep(index - 1);
  };

  return (
    <DialogPrimitive.Root
      open={open}
      modal
      disablePointerDismissal
      onOpenChange={(isOpen) => {
        if (!isOpen) onEnd("skipped");
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClosed();
      }}
    >
      <DialogPrimitive.Portal>
        {/* The page stays in view, dimmed, and cannot be clicked; one thing on it is lit. */}
        <div
          aria-hidden
          data-tour-layer
          className="fixed inset-0 z-[65] duration-200 data-[closing]:animate-out data-[closing]:fade-out-0"
          data-closing={open ? undefined : ""}
        >
          {spot ? (
            <div
              className="absolute rounded-xl transition-[top,left,width,height] duration-300 ease-out motion-reduce:transition-none"
              style={{
                ...spot,
                boxShadow: "0 0 0 2px var(--ring), 0 0 0 200vmax rgb(0 0 0 / 0.5)",
              }}
            />
          ) : (
            <div className="absolute inset-0 animate-in bg-black/50 duration-200 fade-in-0" />
          )}
        </div>
        <DialogPrimitive.Popup
          ref={popupRef}
          initialFocus={nextRef}
          finalFocus={() => {
            if (opener.current?.isConnected && opener.current !== document.body)
              return opener.current;
            // What started it is gone (the invitation): the page's own heading takes focus.
            const heading = document.querySelector<HTMLElement>("main h1");
            heading?.setAttribute("tabindex", "-1");
            return heading ?? true;
          }}
          className={cn(
            "fixed z-[66] flex flex-col overflow-hidden glass-float text-popover-foreground duration-200 outline-none [--float:color-mix(in_oklab,var(--surface-raised)_96%,transparent)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0",
            wide
              ? "max-h-[calc(100dvh-2rem)] w-[22.5rem] max-w-[calc(100vw-2rem)] rounded-xl transition-[top,left] duration-300 ease-out motion-reduce:transition-none"
              : "inset-x-3 bottom-[calc(var(--bar-h)+var(--bar-lift)+0.75rem)] max-h-[calc(100dvh-2*var(--bar-h)-var(--bar-lift)-1.5rem)] rounded-2xl",
          )}
          style={wide ? placeCard(spot) : undefined}
        >
          <div className="min-h-0 scroll-quiet overflow-y-auto p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-muted-foreground tabular-nums">
                {t.overlay.progress(index + 1, tourSteps.length)}
              </p>
              <Dots index={index} />
            </div>
            {/* Keyed by step, so each one arrives instead of being swapped in place. */}
            <div key={step.id} className="animate-menu">
              <DialogPrimitive.Title className="mt-3 font-display text-xl leading-snug font-semibold tracking-[-0.01em]">
                {t.steps[step.id].title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description
                render={<div />}
                className="mt-2 space-y-2.5 text-sm leading-relaxed text-muted-foreground"
              >
                <StepWords
                  id={step.id}
                  sections={ready ? found.sections : []}
                  bible={translations
                    .map((id) => translationNames[id].short)
                    .join(` ${t.steps.bible.and} `)}
                />
              </DialogPrimitive.Description>
            </div>
            <p className="sr-only" aria-live="polite">
              {ready
                ? t.overlay.announce(index + 1, tourSteps.length, t.steps[step.id].title)
                : t.overlay.opening}
            </p>
          </div>
          <div className="flex items-center gap-2 border-t px-5 py-3.5">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2.5 text-muted-foreground pointer-coarse:h-11"
              onClick={() => onEnd("skipped")}
            >
              {t.overlay.skip}
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {index > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:h-11"
                  aria-disabled={!ready}
                  onClick={back}
                >
                  <ArrowLeft aria-hidden />
                  {t.overlay.back}
                </Button>
              )}
              <Button
                ref={nextRef}
                size="sm"
                className="pointer-coarse:h-11"
                // Not `disabled`: a disabled button loses focus, and the way forward keeps it.
                aria-disabled={!ready}
                aria-busy={!ready}
                onClick={next}
              >
                {last ? t.overlay.finish : t.overlay.next}
                {last ? <Check aria-hidden /> : <ArrowRight aria-hidden data-trailing />}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Where the card goes on a wide screen. Beside a control in a bar, just
 * beneath it, centred on it as far as the window allows; beside a large part
 * of the page, in the corner, out of its way; with nothing to point at, in
 * the middle.
 */
function placeCard(spot: Box | null): React.CSSProperties {
  if (!spot) return { top: "50%", left: "50%", translate: "-50% -50%" };
  const width = Math.min(360, window.innerWidth - 32);
  if (spot.height > window.innerHeight * 0.4) return { right: 24, bottom: 24 };
  const left = Math.min(
    Math.max(spot.left + spot.width / 2 - width / 2, 16),
    window.innerWidth - width - 16,
  );
  if (spot.top + spot.height / 2 > window.innerHeight / 2) {
    return { left, bottom: window.innerHeight - spot.top + 14 };
  }
  return { left, top: spot.top + spot.height + 14 };
}

/** Where the tour is, as dots: the current one long and emerald. */
function Dots({ index }: { index: number }) {
  return (
    <span aria-hidden className="flex items-center gap-1.5">
      {tourSteps.map((step, position) => (
        <span
          key={step.id}
          className={cn(
            "h-1.5 rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none",
            position === index ? "w-4 bg-primary" : "w-1.5 bg-foreground/20",
          )}
        />
      ))}
    </span>
  );
}

function StepWords({
  id,
  sections,
  bible,
}: {
  id: (typeof tourSteps)[number]["id"];
  sections: DashboardSection[];
  bible: string;
}) {
  const t = useT("tour").steps;
  switch (id) {
    case "dashboard":
      return (
        <>
          <p>{t.dashboard.body}</p>
          {sections.length > 0 && (
            <>
              <p className="font-medium text-foreground">{t.dashboard.present}</p>
              <ul className="list-disc space-y-1 pl-5 marker:text-primary">
                {sections.map((name) => (
                  <li key={name}>{t.dashboard.sections[name]}</li>
                ))}
              </ul>
            </>
          )}
          {sections.length < dashboardSections.length && <p>{t.dashboard.growing}</p>}
        </>
      );
    case "bible":
      return <p>{t.bible.body(bible)}</p>;
    case "outlines":
      return (
        <>
          <p>{t.outlines.body}</p>
          <p>{t.outlines.note}</p>
        </>
      );
    case "ready":
      return (
        <>
          <p>{t.ready.body}</p>
          <p>{t.ready.again}</p>
        </>
      );
    default:
      return <p>{t[id].body}</p>;
  }
}
