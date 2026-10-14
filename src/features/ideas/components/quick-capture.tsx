"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, ChevronDown, LoaderCircle, Plus } from "lucide-react";

import { useLeaveGuard } from "@/components/layout/leave-guard";
import { ActionStatus } from "@/components/ui/action-status";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useOfflineAccount } from "@/features/offline/components/offline-account";
import { enqueue } from "@/features/offline/queue";
import { useOfflineSettings } from "@/features/offline/settings";
import { useReading } from "@/features/preferences/client";
import { ScriptureBrowser } from "@/features/scripture/components/scripture-browser";
import {
  ScriptureHost,
  type PanelRequest,
} from "@/features/scripture/components/scripture-provider";
import type { ScriptureReference } from "@/features/scripture/reference";
import { translations } from "@/features/scripture/translations";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { holdUnsavedWork, releaseUnsavedWork } from "@/lib/unsaved-work";
import { routes } from "@/lib/site";
import { useMediaQuery, wideEnough } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { createIdea } from "../actions";
import type { IdeaKind } from "../model";
import { emptyDraft, fieldErrors, hasContent, ideaSchemas, type IdeaDraft } from "../schemas";
import { ClassificationSection } from "./classification-section";
import {
  KindField,
  NotesField,
  ReferencesField,
  SubjectField,
  TitleField,
  type UpdateDraft,
} from "./idea-fields";

/** An idea a capture has just saved. */
export type CapturedIdea = { id: string; title: string; kind: IdeaKind };

/**
 * What a capture can begin with: a kind already chosen, and passages already
 * on it. `onSaved` is what the capture was begun for (an outline of the sermon
 * about to be captured): it is called once, after the idea is saved, with the
 * idea as it was saved, and never when the capture is closed or abandoned. It
 * answers true when it has said what happened, and the usual toast is then
 * left out.
 */
export type CaptureSeed = {
  kind?: IdeaKind;
  references?: readonly ScriptureReference[];
  onSaved?: (idea: CapturedIdea) => boolean | void;
};

type QuickCapture = {
  open: () => void;
  /**
   * Opens capture with something already in it: the Scripture an idea is
   * being started from. Nothing is saved by opening; closing it untouched
   * leaves no trace.
   */
  openWith: (seed: CaptureSeed) => void;
};

const QuickCaptureContext = createContext<QuickCapture>({ open: () => {}, openWith: () => {} });

/** The draft a seed makes. A sermon's first passage is its main text, as when one is added by hand. */
export function seededDraft({ kind = emptyDraft.kind, references = [] }: CaptureSeed): IdeaDraft {
  return {
    ...emptyDraft,
    kind,
    references: references.map((reference, index) => ({
      ...reference,
      isPrimary: kind === "sermon" && index === 0,
    })),
  };
}

/** Opens quick capture from anywhere in the signed-in shell. */
export function useQuickCapture() {
  return useContext(QuickCaptureContext);
}

/** The capture action as a button, for pages. The bar and the tab bar have their own. */
export function CaptureButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  const capture = useQuickCapture();
  const label = useT("ideas").capture.button;
  return (
    <Button type="button" onClick={capture.open} {...props}>
      <Plus aria-hidden />
      {children ?? label}
    </Button>
  );
}

const form = "capture";

/**
 * Quick capture: one dialog for the whole shell. Only the thought itself is
 * required; its kind starts as Undecided, and everything else waits behind
 * "More details", where the classifications are closed again until wanted.
 *
 * Nothing typed is lost by accident. Closing the dialog, or leaving the page,
 * with something written asks first; choosing to go discards it, and every
 * close clears the validation messages. A failed save leaves every field as it
 * was, and the idea's ID is made before the first attempt so a retry cannot
 * save it twice. A save the server never answered is kept on this device
 * instead, where it can be (`keepOnDevice`), and is said to be there and not
 * in the account; Settings and the offline page list what is waiting.
 */
export function QuickCaptureProvider({ children }: { children: React.ReactNode }) {
  const t = useT("ideas").capture;
  const offline = useT("offline");
  const account = useOfflineAccount();
  const offlineSettings = useOfflineSettings();
  const locale = useLocale();
  const reading = useReading();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<IdeaDraft>(emptyDraft);
  // What the capture was opened with. Only what is written beyond it is the person's to lose.
  const [seed, setSeed] = useState<IdeaDraft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [captures, setCaptures] = useState(0);
  const [panel, setPanel] = useState<PanelRequest | null>(null);
  const [panelOpening, setPanelOpening] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const ideaId = useRef<string | null>(null);
  // What this capture was begun for, if anything. It goes when the capture does.
  const afterSave = useRef<CaptureSeed["onSaved"]>(undefined);
  const titleRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const wide = useMediaQuery(wideEnough);

  const value = useMemo(() => {
    // A phone raises its keyboard only for a focus made inside the tap itself,
    // and the dialog's own comes a frame later: so the dialog is drawn now and
    // the title focused before the tap is over.
    const show = (prepare?: () => void) => {
      flushSync(() => {
        prepare?.();
        setOpen(true);
      });
      titleRef.current?.focus();
    };
    return {
      open: () => show(),
      openWith: (given: CaptureSeed) => {
        const next = seededDraft(given);
        ideaId.current = null;
        afterSave.current = given.onSaved;
        show(() => {
          setSeed(next);
          setDraft(next);
          setErrors({});
          setResult(null);
          setPanel(null);
        });
      },
    };
  }, []);
  const update: UpdateDraft = useCallback((change) => {
    setDraft(change);
    setErrors({});
  }, []);
  const openPanel = useCallback((request: PanelRequest) => {
    setPanel(request);
    setPanelOpening((count) => count + 1);
  }, []);

  function clear() {
    setDraft(emptyDraft);
    setSeed(emptyDraft);
    setErrors({});
    setResult(null);
    setMore(false);
    setCaptures((count) => count + 1);
    setPanel(null);
    ideaId.current = null;
    afterSave.current = undefined;
  }

  /**
   * Keeps a capture the server did not answer on this device, in its owner's
   * queue (features/offline), to be saved to the account later. "off" where
   * this device does not keep captures or there is no account to keep it
   * under; "failed" where the device would not keep it. Either way the form
   * keeps every word.
   */
  async function keepOnDevice(input: unknown, id: string): Promise<"kept" | "off" | "failed"> {
    if (!account || !offlineSettings.captureOffline) return "off";
    holdUnsavedWork(keepOnDevice);
    try {
      await enqueue(account, {
        opId: id,
        type: "idea.create",
        entityType: "idea",
        entityId: id,
        payload: input,
      });
      return "kept";
    } catch {
      return "failed";
    } finally {
      releaseUnsavedWork(keepOnDevice);
    }
  }

  async function save() {
    if (busy) return;
    const parsed = ideaSchemas(locale).ideaInput.safeParse(draft);
    if (!parsed.success) {
      const found = fieldErrors(parsed.error);
      setErrors(found);
      if (found.notes || found.subject) setMore(true);
      if (found.title) titleRef.current?.focus();
      else setResult({ ok: false, message: Object.values(found)[0] });
      return;
    }

    setBusy(true);
    setResult(null);
    ideaId.current ??= crypto.randomUUID();
    let outcome: Awaited<ReturnType<typeof createIdea>>;
    try {
      outcome = await createIdea(parsed.data, ideaId.current);
    } catch {
      // No answer from the server: kept on this device instead where it can be, under
      // the same ID, so saving it later is this same capture and never a second.
      const kept = await keepOnDevice(parsed.data, ideaId.current);
      setBusy(false);
      if (kept === "kept") {
        clear();
        setOpen(false);
        toast({ message: offline.capture.kept });
        return;
      }
      outcome = { ok: false, message: kept === "failed" ? offline.capture.notKept : t.offline };
    }
    setBusy(false);

    if (!outcome.ok) {
      setResult(outcome);
      return;
    }
    const then = afterSave.current;
    clear();
    setOpen(false);
    if (
      outcome.id &&
      then?.({ id: outcome.id, title: parsed.data.title, kind: parsed.data.kind }) === true
    ) {
      return;
    }
    toast({
      message: outcome.message,
      action: outcome.id ? { label: t.open, href: `${routes.library}/${outcome.id}` } : undefined,
    });
  }

  // Opened from a passage and left as it came, there is nothing to ask about.
  const dirty = hasContent(draft) && JSON.stringify(draft) !== JSON.stringify(seed);
  const unsaved = t.unsaved;
  // Leaving the page with something written asks first, and leaving discards it.
  const guard = useLeaveGuard(open && dirty, unsaved, () => {
    clear();
    setOpen(false);
  });

  /** Closing with something written asks first; closing empty just tidies up. */
  function requestClose() {
    // A save in flight finishes first.
    if (busy) return;
    if (dirty) return setDiscarding(true);
    clear();
    setOpen(false);
  }
  // The panel shares the dialog: beside the form where there is room, in its place where there is not.
  const sideBySide = panel !== null && wide;
  const replaced = panel !== null && !wide;

  return (
    <QuickCaptureContext.Provider value={value}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else requestClose();
        }}
      >
        <DialogContent
          initialFocus={titleRef}
          className={cn(
            "transition-[max-width] duration-200",
            sideBySide ? "max-w-5xl" : "max-w-xl",
            replaced && "h-[calc(var(--vv-h,100dvh)-1.5rem)]",
          )}
        >
          <ScriptureHost onOpenPanel={openPanel}>
            <div className="flex min-h-0 flex-1">
              <form
                noValidate
                hidden={replaced}
                aria-busy={busy}
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
                className={cn("min-h-0 min-w-0 flex-1 flex-col", replaced ? "hidden" : "flex")}
              >
                <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-1">
                  <div className="min-w-0">
                    <DialogTitle>{t.title}</DialogTitle>
                    <DialogDescription>{t.description}</DialogDescription>
                  </div>
                  <DialogClose label={t.close} className="-mr-2" />
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pt-3 pb-4">
                  <TitleField
                    form={form}
                    draft={draft}
                    update={update}
                    errors={errors}
                    inputRef={titleRef}
                    hideLabel
                    placeholder={t.placeholder}
                  />
                  <KindField
                    form={form}
                    hideLabel
                    value={draft.kind}
                    onChange={(kind) => update((current) => ({ ...current, kind }))}
                  />
                  <ReferencesField draft={draft} update={update} />

                  <div>
                    <button
                      type="button"
                      aria-expanded={more}
                      aria-controls="capture-more"
                      onClick={() => setMore((shown) => !shown)}
                      className="flex items-center gap-1.5 rounded-md py-1 text-sm font-semibold text-muted-foreground transition-colors duration-150 hover:text-foreground"
                    >
                      <ChevronDown
                        className={cn(
                          "size-4 transition-transform duration-200",
                          more && "rotate-180",
                        )}
                        aria-hidden
                      />
                      {t.more}
                    </button>
                    <div
                      id="capture-more"
                      hidden={!more}
                      className={more ? "mt-3 animate-menu space-y-4" : undefined}
                    >
                      <NotesField
                        form={form}
                        draft={draft}
                        update={update}
                        errors={errors}
                        onSubmitShortcut={() => void save()}
                      />
                      {draft.kind === "sermon" && (
                        <SubjectField form={form} draft={draft} update={update} errors={errors} />
                      )}
                      {/* Remounted with each capture, so it is closed again for the next. */}
                      <ClassificationSection key={captures} draft={draft} update={update} />
                    </div>
                  </div>
                </div>

                <div className="border-t px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    {dirty ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={clear}
                      >
                        {t.clear}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground max-sm:hidden">{t.hint}</span>
                    )}
                    <Button type="submit" disabled={busy} aria-busy={busy} className="ml-auto">
                      {busy && <LoaderCircle className="animate-spin" aria-hidden />}
                      {busy ? t.saving : t.save}
                    </Button>
                  </div>
                  <ActionStatus result={result} />
                </div>
              </form>

              {panel && (
                <ScriptureBrowser
                  key={panelOpening}
                  initial={panel.reference}
                  attach={panel.attach}
                  besideIdea={sideBySide}
                  onDone={() => setPanel(null)}
                  className={sideBySide ? "w-[27rem] flex-none border-l" : undefined}
                  header={
                    <div className="flex items-center gap-1 px-2 pt-3 pb-2 sm:px-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="px-2.5"
                        onClick={() => setPanel(null)}
                      >
                        <ArrowLeft aria-hidden />
                        {sideBySide ? t.closeScripture : t.backToIdea}
                      </Button>
                      <span className="ml-auto pr-2 text-xs text-muted-foreground">
                        {translations[reading.translation].name}
                      </span>
                    </div>
                  }
                />
              )}
            </div>
          </ScriptureHost>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.discardTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {unsaved} {t.discardDetail}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.keepWriting}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDiscarding(false);
                clear();
                setOpen(false);
              }}
            >
              {t.discard}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {guard.dialog}
    </QuickCaptureContext.Provider>
  );
}
