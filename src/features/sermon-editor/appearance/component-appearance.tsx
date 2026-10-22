"use client";

import type { Editor } from "@tiptap/react";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { mergeAppearance } from "@/features/editor-lab/styles/draft";
import { componentLayers, resolveComponent } from "@/features/editor-lab/styles/resolve";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { SessionFields, SessionFooter } from "./controls";
import { componentGroups } from "./fields";
import { AppearanceModal } from "./modal";
import { AppearancePreview, componentExcerpt } from "./preview";
import { OutlineResets } from "./resets-menu";
import { useAppearanceSession } from "./session";
import { useComponentTarget, type Target } from "./target";

/*
 * Component Appearance (A1-UI.2B.2): one component, customized on its own.
 * It opens on a component chosen by its ID (`useAppearanceDialogs`), says
 * which one and that only it changes, offers only that kind's properties
 * over its type's style (inherited dynamically), and previews the component
 * itself. Its reset takes its own appearance away; the outline-wide resets
 * are kept apart in a menu. It never shows the outline's other settings.
 */
export function ComponentAppearance({
  editor,
  target,
  onClose,
}: {
  editor: Editor;
  target: Target;
  onClose: () => void;
}) {
  const a = useT("editorLab").appearance;
  const session = useAppearanceSession(editor, { targetId: target.id });
  const status = useComponentTarget(editor, target);
  const [showPreview, setShowPreview] = useState(true);
  // The component is marked in the outline while it is customized (view state only).
  useEffect(() => {
    if (!editor.isDestroyed) editor.commands.setAppearanceTarget(target.id);
    return () => {
      if (!editor.isDestroyed) editor.commands.setAppearanceTarget(null);
    };
  }, [editor, target.id]);
  // The component as it is when the window opens; its look follows the draft.
  const excerpt = useMemo(
    () => componentExcerpt(editor.state.doc, target.id) ?? [],
    [editor, target.id],
  );
  const ready = status.state === "ready";
  const { merged, preset } = session;
  const appearance = ready ? mergeAppearance(session.appearance, session.draft, target.id) : null;

  return (
    <AppearanceModal
      session={session}
      onClose={onClose}
      title={a.componentTitle}
      description={a.componentHint}
      testId="component-appearance"
      className="md:w-[min(60rem,calc(100%-3rem))]"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain md:flex-row md:overflow-hidden">
        <div
          className={cn(
            "shrink-0 p-3 md:order-last md:flex md:w-[45%] md:flex-col md:border-l md:p-4",
            showPreview ? "h-56" : "h-auto",
            "md:h-auto",
          )}
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mb-2 md:hidden"
            aria-expanded={showPreview}
            onClick={() => setShowPreview((shown) => !shown)}
          >
            {showPreview ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            {showPreview ? a.hidePreview : a.showPreview}
          </Button>
          <AppearancePreview
            session={session}
            content={excerpt}
            mark={target.id}
            caption={a.previewComponent}
            className={cn(
              "h-[calc(100%-2.5rem)] md:h-full md:flex-1",
              !showPreview && "max-md:hidden",
            )}
          />
        </div>
        <div className="relative flex flex-col gap-4 p-4 sm:px-5 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain">
          {status.state === "ready" ? (
            <div
              className="flex flex-col gap-1 rounded-lg border p-3"
              data-testid="appearance-target"
            >
              <span className="text-sm">
                <span className="font-semibold">{a.kind[target.kind]}</span>
                {status.text ? ` · ${status.text}` : ` · ${a.untitled}`}
              </span>
              <span className="text-xs text-muted-foreground">{a.onlyThis}</span>
            </div>
          ) : (
            <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">
              {status.state === "gone" ? a.targetGone : a.targetChanged}
            </p>
          )}
          {ready && (
            <>
              <Button
                type="button"
                variant="outline"
                className="self-start pointer-coarse:h-11"
                onClick={() => session.reset({ layer: "instance", ...target })}
              >
                <RotateCcw aria-hidden /> {a.resetSelected}
              </Button>
              <SessionFields
                session={session}
                groups={componentGroups[target.kind]}
                kind={target.kind}
                layers={componentLayers(merged, target.kind, appearance, preset)}
                ownSource="own"
                resolved={resolveComponent(merged, target.kind, appearance, preset)}
                pathOf={(field) => ({ layer: "instance", ...target, field })}
              />
            </>
          )}
        </div>
      </div>
      <SessionFooter
        session={session}
        start={<OutlineResets session={session} offer={["allComponents", "original"]} />}
      />
    </AppearanceModal>
  );
}
