"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
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
import { ScriptureBrowser } from "@/features/scripture/components/scripture-browser";
import {
  ScriptureHost,
  type PanelRequest,
} from "@/features/scripture/components/scripture-provider";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import { useMediaQuery, wideEnough } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { createIdea } from "../actions";
import { emptyDraft, fieldErrors, hasContent, ideaInputSchema, type IdeaDraft } from "../schemas";
import {
  KindField,
  NotesField,
  ReferencesField,
  SermonFields,
  StatusField,
  TitleField,
  type UpdateDraft,
} from "./idea-fields";

const QuickCaptureContext = createContext<{ open: () => void }>({ open: () => {} });

/** Opens quick capture from anywhere in the signed-in shell. */
export function useQuickCapture() {
  return useContext(QuickCaptureContext);
}

/** The capture action as a button, for pages. The bar and the tab bar have their own. */
export function CaptureButton({
  children = "Capture an idea",
  ...props
}: React.ComponentProps<typeof Button>) {
  const capture = useQuickCapture();
  return (
    <Button type="button" onClick={capture.open} {...props}>
      <Plus aria-hidden />
      {children}
    </Button>
  );
}

const form = "capture";

/**
 * Quick capture: one dialog for the whole shell. Only the thought itself is
 * required; its kind starts as Undecided, and everything else waits behind
 * "More details".
 *
 * Nothing typed is lost by accident. Closing the dialog, or leaving the page,
 * with something written asks first; choosing to go discards it, and every
 * close clears the validation messages. A failed save leaves every field as it
 * was, and the idea's ID is made before the first attempt so a retry cannot
 * save it twice.
 */
export function QuickCaptureProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<IdeaDraft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [panel, setPanel] = useState<PanelRequest | null>(null);
  const [panelOpening, setPanelOpening] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const ideaId = useRef<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const wide = useMediaQuery(wideEnough);

  const value = useMemo(() => ({ open: () => setOpen(true) }), []);
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
    setErrors({});
    setResult(null);
    setMore(false);
    setPanel(null);
    ideaId.current = null;
  }

  async function save() {
    if (busy) return;
    const parsed = ideaInputSchema.safeParse(draft);
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
      outcome = {
        ok: false,
        message: "The idea could not be saved. Check your connection and try again.",
      };
    }
    setBusy(false);

    if (!outcome.ok) {
      setResult(outcome);
      return;
    }
    clear();
    setOpen(false);
    toast({
      message: outcome.message,
      action: outcome.id ? { label: "Open", href: `${routes.library}/${outcome.id}` } : undefined,
    });
  }

  const dirty = hasContent(draft);
  const unsaved = "This idea has not been saved.";
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
            replaced && "h-[calc(100dvh-1.5rem)]",
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
                    <DialogTitle>Capture an idea</DialogTitle>
                    <DialogDescription>Save the thought now. Sort it out later.</DialogDescription>
                  </div>
                  <DialogClose label="Close capture" className="-mr-2" />
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pt-3 pb-4">
                  <TitleField
                    form={form}
                    draft={draft}
                    update={update}
                    errors={errors}
                    inputRef={titleRef}
                    hideLabel
                    placeholder="What is the thought?"
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
                      More details
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
                        <SermonFields form={form} draft={draft} update={update} errors={errors} />
                      )}
                      <StatusField form={form} draft={draft} update={update} />
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
                        Clear
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground max-sm:hidden">
                        Enter saves. In notes, Ctrl or ⌘ with Enter.
                      </span>
                    )}
                    <Button type="submit" disabled={busy} aria-busy={busy} className="ml-auto">
                      {busy && <LoaderCircle className="animate-spin" aria-hidden />}
                      {busy ? "Saving…" : "Save idea"}
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
                        {sideBySide ? "Close Scripture" : "Back to the idea"}
                      </Button>
                      <span className="ml-auto pr-2 text-xs text-muted-foreground">
                        King James Version
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
            <AlertDialogTitle>Discard this idea?</AlertDialogTitle>
            <AlertDialogDescription>{unsaved} Closing now will discard it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep writing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDiscarding(false);
                clear();
                setOpen(false);
              }}
            >
              Discard idea
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {guard.dialog}
    </QuickCaptureContext.Provider>
  );
}
