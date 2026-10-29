"use client";

import { useAuth } from "@clerk/nextjs";
import type { Editor, Extensions } from "@tiptap/core";
import { Archive, Ellipsis, LoaderCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { BackLink } from "@/components/layout/back-link";
import { useLeaveGuard } from "@/components/layout/leave-guard";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { deleteOutline } from "@/features/outlines/actions";
import { useT } from "@/i18n/client";
import { holdUnsavedWork, releaseUnsavedWork } from "@/lib/unsaved-work";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";
import { saveOutlineDocument } from "../persistence/actions";
import { editorSource } from "../persistence/autosave/editor-adapter";
import { documentTransport } from "../persistence/autosave/transport";
import type { DocumentReadOutcome } from "../persistence/saving";
import type { EditorSessionState } from "../persistence/session/model";
import {
  createEditorSession,
  type AttachResult,
  type EditorSession,
  type EditorSessionOptions,
} from "../persistence/session/session";
import { sessionWriteGuard } from "../persistence/session/write-guard";
import { SermonWorkspace } from "../sermon-workspace";
import { DocumentPreview } from "./document-preview";
import { Notice, RecoveryView } from "./recovery-view";
import { describeSave, type SaveView } from "./save-status";
import { SaveIndicator } from "./save-indicator";
import { browserConnectivity, identitySignal } from "./signals";

/*
 * The production sermon editor's host (A3): the one place an outline's
 * sermon document is opened for editing, on `/outlines/[id]`.
 *
 * - **One session at a time.** It makes one editor session
 *   (`createEditorSession`) per generation, and makes the next one only once
 *   the last one's `dispose()` has resolved (its coordinator stopped, its
 *   controller's IndexedDB work finished, its lock released). Nothing carries
 *   over between them: each reads the server and checks the device itself.
 * - **Only the session decides.** The editor is mounted only from `ready`,
 *   with what the session verified (or restored), and every document change
 *   goes through `sessionWriteGuard`. `setEditable` follows `canEdit()` for
 *   the view's sake only; the guard is the boundary.
 * - **Nothing by itself.** No restore, discard, recover, reconcile, or
 *   takeover is ever started from a subscription; each is a button. The one
 *   new session started without a press is after this tab handed the outline
 *   over (`lost: handedOff`), or came back from the back-forward cache, and
 *   it only reads and asks for the lock.
 * - **Leaving.** Navigation is guarded while words are not yet kept on this
 *   device (`pending`, `unprotected`), and the application update is held
 *   while anything is not on the server or this device (`holdsUnsavedWork`).
 *   Disposal's last flush is never counted on.
 */

export type OutlineHostSermon = {
  id: string;
  title: string;
  kind: string;
  archivedAt: string | null;
};

type HostProps = {
  /** `users.id`: the persistence and ownership scope. Never Clerk's ID. */
  owner: string;
  /** The Clerk user the page was rendered for; a session runs only while Clerk says the same. */
  clerkUserId: string;
  outlineId: string;
  sermon: OutlineHostSermon;
  /** For tests: what the session is made with, besides owner, outline, identity, and transport. */
  sessionOptions?: Partial<EditorSessionOptions>;
};

export function OutlineDocumentHost(props: HostProps) {
  const { isLoaded, userId } = useAuth();
  const t = useT("sermonEditor").states;
  if (!isLoaded)
    return (
      <Frame sermon={props.sermon}>
        <Loading />
      </Frame>
    );
  if (userId !== props.clerkUserId) {
    return (
      <Frame sermon={props.sermon}>
        <StatePanel title={t.identityTitle} body={t.identityBody}>
          <Button onClick={() => window.location.reload()}>{t.reload}</Button>
        </StatePanel>
      </Frame>
    );
  }
  return <SessionHost {...props} clerkId={userId ?? null} />;
}

function SessionHost({
  owner,
  clerkUserId,
  outlineId,
  sermon,
  sessionOptions,
  clerkId,
}: HostProps & { clerkId: string | null }) {
  // The identity the session watches: Clerk's user, fed on every render.
  const identity = useMemo(() => identitySignal(clerkUserId), [clerkUserId]);
  useEffect(() => identity.set(clerkId), [identity, clerkId]);

  const [generation, setGeneration] = useState(0);
  // The session with the generation it was made for: a session is shown only while its own is current.
  const [made, setMade] = useState<{ session: EditorSession; generation: number } | null>(null);
  // The end of the session before this one; the next is made only after it.
  const ending = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    let created: EditorSession | null = null;
    const previous = ending.current;
    void previous.then(() => {
      if (cancelled) return;
      created = createEditorSession({
        connectivity: browserConnectivity(),
        ...sessionOptions,
        owner,
        outlineId,
        identity,
        transport: sessionOptions?.transport ?? documentTransport({ save: saveOutlineDocument }),
      });
      setMade({ session: created, generation });
    });
    return () => {
      cancelled = true;
      if (created) {
        const gone = created;
        ending.current = previous.then(() => gone.dispose());
      }
      setMade(null);
    };
    // `sessionOptions` is a test seam, read when a session is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, outlineId, identity, generation]);

  const renew = useCallback(() => setGeneration((count) => count + 1), []);

  if (!made || made.generation !== generation) {
    return (
      <Frame sermon={sermon}>
        <Loading />
      </Frame>
    );
  }
  return <SessionView key={made.generation} session={made.session} sermon={sermon} renew={renew} />;
}

function useSessionState(session: EditorSession): EditorSessionState {
  return useSyncExternalStore(
    useCallback((listener) => session.subscribe(listener), [session]),
    () => session.getState(),
    () => session.getState(),
  );
}

/** The indicator's view of the session's autosave, while it has one. */
function useSaveView(session: EditorSession, state: EditorSessionState): SaveView | null {
  const autosave =
    state.kind === "active" || state.kind === "relinquishing" ? session.getAutosave() : null;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!autosave) return;
    const bump = () => setTick((count) => count + 1);
    const stopLocal = autosave.controller.subscribe(bump);
    const stopNetwork = autosave.coordinator.subscribe(bump);
    bump();
    return () => {
      stopLocal();
      stopNetwork();
    };
  }, [autosave]);
  if (!autosave) return null;
  return describeSave(autosave.controller.getState(), autosave.coordinator.getState());
}

type Opened = { document: unknown; key: string; restored: boolean };

function SessionView({
  session,
  sermon,
  renew: renewAny,
}: {
  session: EditorSession;
  sermon: OutlineHostSermon;
  renew: () => void;
}) {
  // One new session for this one at most, however many things ask (a state seen twice, a press).
  const renewed = useRef(false);
  const renew = useCallback(() => {
    if (renewed.current) return;
    renewed.current = true;
    renewAny();
  }, [renewAny]);
  const t = useT("sermonEditor");
  const back = useT("outlines").page.back;
  const state = useSessionState(session);
  const save = useSaveView(session, state);
  const editor = useRef<Editor | null>(null);
  const [attach, setAttach] = useState<AttachResult | null>(null);
  const [refused, setRefused] = useState(false);

  // What the editor opens: taken once, at `ready`, and kept while the session edits.
  const [opened, setOpened] = useState<Opened | null>(null);
  if (state.kind === "ready" && !opened) {
    setOpened({
      document: state.restored?.content ?? state.base.content,
      key: `${session.outlineId}:${state.restored ? state.restored.draftId : state.base.revision}`,
      restored: Boolean(state.restored),
    });
  }

  const extensions: Extensions = useMemo(
    () => [sessionWriteGuard(() => session.canEdit())],
    [session],
  );
  const onReady = useCallback(
    (ready: Editor) => {
      editor.current = ready;
      ready.setEditable(false);
      const result = session.attach(editorSource(ready));
      setAttach(result);
      ready.setEditable(session.canEdit());
    },
    [session],
  );
  // The view follows the session; the write guard is what refuses.
  useEffect(() => {
    const current = editor.current;
    if (current && !current.isDestroyed) current.setEditable(session.canEdit());
  }, [session, state]);

  // After this tab handed the outline over: a new session, which comes up read-only.
  useEffect(() => {
    if (state.kind === "lost" && state.reason === "handedOff") renew();
  }, [state, renew]);
  // A page restored from the back-forward cache ended its session at `pagehide`: open a new one.
  useEffect(() => {
    const shown = (event: PageTransitionEvent) => {
      if (event.persisted && session.getState().kind === "lost") renew();
    };
    window.addEventListener("pageshow", shown);
    return () => window.removeEventListener("pageshow", shown);
  }, [session, renew]);

  // The application update is held while anything is not on the server or this device.
  const holds = save?.holdsWork ?? false;
  useEffect(() => {
    if (!holds) return;
    const key = {};
    holdUnsavedWork(key);
    return () => releaseUnsavedWork(key);
  }, [holds]);
  const guard = useLeaveGuard(save?.guardLeaving ?? false, t.save.leave);

  const editing =
    opened && (state.kind === "ready" || state.kind === "active" || state.kind === "relinquishing");

  if (editing) {
    const problem = refused
      ? t.states.refused
      : attach && !attach.ok
        ? t.states.attachFailed
        : null;
    return (
      <>
        <SermonWorkspace
          key={opened.key}
          document={opened.document}
          documentKey={opened.key}
          back={{ href: `${routes.library}/${sermon.id}`, label: back }}
          extensions={extensions}
          onReady={onReady}
          onRefused={() => setRefused(true)}
          headerStart={
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <SermonTitle sermon={sermon} />
              {save && (
                <SaveIndicator view={save} onAction={(action) => act(action, session, renew)} />
              )}
              {problem && (
                <span
                  role="alert"
                  data-testid="sermon-editor-attach"
                  className="text-sm text-destructive"
                >
                  {problem}
                </span>
              )}
            </div>
          }
          headerEnd={
            <OutlineMenu
              session={session}
              sermon={sermon}
              renew={renew}
              onLeaving={guard.allowLeaving}
            />
          }
        />
        {guard.dialog}
      </>
    );
  }

  return (
    <Frame sermon={sermon}>
      <SessionPanel session={session} state={state} sermon={sermon} renew={renew} />
      {guard.dialog}
    </Frame>
  );
}

function act(action: SaveView["action"], session: EditorSession, renew: () => void) {
  const autosave = session.getAutosave();
  switch (action) {
    case "recover":
      autosave?.coordinator.recover();
      return;
    case "retry":
      autosave?.coordinator.retry();
      return;
    case "retryLocal":
      autosave?.controller.retry();
      return;
    case "review":
      // A new session, made once this one has ended; it reads the server and the device afresh.
      renew();
      return;
    case "signIn":
      window.location.assign(routes.signIn);
      return;
  }
}

function SessionPanel({
  session,
  state,
  sermon,
  renew,
}: {
  session: EditorSession;
  state: EditorSessionState;
  sermon: OutlineHostSermon;
  renew: () => void;
}) {
  const t = useT("sermonEditor").states;
  const sermonHref = `${routes.library}/${sermon.id}`;
  switch (state.kind) {
    case "acquiring":
    case "verifying":
    case "ready":
      return <Loading />;
    case "recovery_required":
    case "resolving":
      return <RecoveryView session={session} state={state} />;
    case "read_only":
      return (
        <StatePanel title={t.readOnlyTitle} body={t.readOnlyBody} testId="outline-read-only">
          <Button onClick={() => session.requestTakeover()} data-testid="edit-here">
            {t.editHere}
          </Button>
          {state.takeover === "declined" && (
            <Notice
              tone="info"
              text={state.reason === "unprotected" ? t.declinedUnprotected : t.declinedStarting}
            />
          )}
          {state.takeover === "unanswered" && <Notice tone="info" text={t.unanswered} />}
          <SavedPreview outlineId={session.outlineId} />
        </StatePanel>
      );
    case "takeover_pending":
      return (
        <StatePanel
          title={t.readOnlyTitle}
          body={t.takeoverPending}
          busy
          testId="outline-takeover"
        />
      );
    case "verification_failed": {
      const copy = {
        offline: [t.offlineTitle, t.offlineBody],
        failed: [t.failedTitle, t.failedBody],
        unauthorized: [t.unauthorizedTitle, t.unauthorizedBody],
        missing: [t.missingTitle, t.missingBody],
        unreadable: [t.unreadableTitle, t.unreadableBody],
      }[state.reason];
      return (
        <StatePanel title={copy[0]} body={copy[1]} testId={`outline-${state.reason}`}>
          {(state.reason === "offline" ||
            state.reason === "failed" ||
            state.reason === "unreadable") && (
            <Button variant="outline" onClick={() => session.recheck()}>
              <RotateCcw aria-hidden />
              {t.tryAgain}
            </Button>
          )}
          {state.reason === "unauthorized" && (
            <Button onClick={() => window.location.assign(routes.signIn)}>{t.signIn}</Button>
          )}
          {state.reason === "missing" && (
            <Link href={sermonHref} className={buttonVariants({ variant: "outline" })}>
              {t.backToSermon}
            </Link>
          )}
        </StatePanel>
      );
    }
    case "lost":
      if (state.reason === "handedOff") return <Loading />;
      return (
        <StatePanel
          title={t.lostTitle}
          body={state.reason === "lockLost" ? t.lockLost : t.handedOff}
          testId="outline-lost"
        >
          <Button onClick={renew}>{t.reconnect}</Button>
        </StatePanel>
      );
    case "identity_invalidated":
      return (
        <StatePanel title={t.identityTitle} body={t.identityBody} testId="outline-identity">
          <Button onClick={() => window.location.reload()}>{t.reload}</Button>
        </StatePanel>
      );
    case "unavailable":
      return (
        <StatePanel
          title={t.unsupportedTitle}
          body={t.unsupportedBody}
          testId="outline-unsupported"
        />
      );
    case "active":
    case "relinquishing":
    case "disposed":
      return <Loading />;
  }
}

/** The saved outline, read once from the server for the read-only state. Never polled. */
function SavedPreview({ outlineId }: { outlineId: string }) {
  const t = useT("sermonEditor").states;
  const [read, setRead] = useState<DocumentReadOutcome | null>(null);
  useEffect(() => {
    let current = true;
    void documentTransport({ save: saveOutlineDocument })
      .read(outlineId)
      .then((outcome) => current && setRead(outcome));
    return () => {
      current = false;
    };
  }, [outlineId]);
  if (!read) return <p className="basis-full text-sm text-muted-foreground">{t.previewLoading}</p>;
  if (read.kind !== "found") {
    return <p className="basis-full text-sm text-muted-foreground">{t.previewFailed}</p>;
  }
  return (
    <div className="basis-full pt-2">
      <DocumentPreview
        content={read.content}
        label={t.readOnlyTitle}
        testId="outline-saved-preview"
      />
    </div>
  );
}

function OutlineMenu({
  session,
  sermon,
  renew,
  onLeaving,
}: {
  session: EditorSession;
  sermon: OutlineHostSermon;
  renew: () => void;
  /** Says the navigation that follows is deliberate (`useLeaveGuard`'s `allowLeaving`). */
  onLeaving: () => void;
}) {
  const t = useT("sermonEditor").header;
  const router = useRouter();
  const toast = useToast();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t.more}
          title={t.more}
          data-testid="outline-more"
          className={cn(
            buttonVariants({ variant: "outline", size: "icon" }),
            "pointer-coarse:size-11",
          )}
        >
          <Ellipsis aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            data-testid="delete-outline"
            onClick={() =>
              setConfirmation({
                title: t.deleteTitle,
                description: t.deleteBody,
                confirmLabel: t.deleteConfirm,
                destructive: true,
                // Editing ends first, so nothing is saved to an outline being deleted.
                run: async () => {
                  // Deliberate: the guard neither asks nor moves history as editing ends.
                  onLeaving();
                  await session.dispose();
                  return deleteOutline(session.outlineId);
                },
              })
            }
          >
            {t.deleteOutline}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        confirmation={confirmation}
        busy={busy}
        onCancel={() => setConfirmation(null)}
        onConfirm={async (chosen) => {
          setBusy(true);
          const result = await chosen.run();
          setBusy(false);
          setConfirmation(null);
          toast({ message: result.message });
          if (result.ok) router.replace(`${routes.library}/${sermon.id}`);
          // Not deleted: editing was ended for it, so open the outline again.
          else renew();
        }}
      />
    </>
  );
}

function SermonTitle({ sermon }: { sermon: OutlineHostSermon }) {
  const t = useT("sermonEditor").header;
  const aside = sermon.kind !== "sermon" ? t.refiled : sermon.archivedAt ? t.archived : null;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Link
        href={`${routes.library}/${sermon.id}`}
        data-testid="outline-sermon-title"
        className="truncate font-serif text-base font-medium underline-offset-4 hover:text-primary hover:underline"
      >
        {sermon.title}
      </Link>
      {aside && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          <Archive className="size-3" aria-hidden />
          {aside}
        </span>
      )}
    </span>
  );
}

/** The page around every state but editing: the outline page's own head. */
export function Frame({
  sermon,
  children,
}: {
  sermon: OutlineHostSermon;
  children: React.ReactNode;
}) {
  const outlines = useT("outlines").page;
  const header = useT("sermonEditor").header;
  const aside =
    sermon.kind !== "sermon" ? outlines.refiled : sermon.archivedAt ? outlines.archived : null;
  return (
    <div className="container-page py-10 lg:py-12">
      <BackLink href={`${routes.library}/${sermon.id}`}>{outlines.back}</BackLink>
      <PageHeader
        title={outlines.title}
        description={
          <>
            {header.sermon}{" "}
            <Link
              href={`${routes.library}/${sermon.id}`}
              className="rounded-sm font-serif font-medium text-foreground underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline"
            >
              {sermon.title}
            </Link>
          </>
        }
      />
      {aside && (
        <p className="mt-4 flex max-w-4xl items-start gap-2 rounded-xl border bg-muted/50 px-4 py-3 text-sm">
          <Archive className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {aside}
        </p>
      )}
      {children}
    </div>
  );
}

function Loading() {
  const t = useT("sermonEditor").opening;
  return (
    <p
      role="status"
      data-testid="outline-opening"
      className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"
    >
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {t.title}
    </p>
  );
}

export function StatePanel({
  title,
  body,
  busy = false,
  testId,
  children,
}: {
  title: string;
  body: string;
  busy?: boolean;
  testId?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      aria-labelledby={testId ? `${testId}-title` : undefined}
      className="mt-6 max-w-3xl space-y-3"
    >
      <h2 id={testId ? `${testId}-title` : undefined} className="font-serif text-2xl font-medium">
        {title}
      </h2>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {body}
      </p>
      {children && <div className="flex flex-wrap items-center gap-3 pt-1">{children}</div>}
    </section>
  );
}
