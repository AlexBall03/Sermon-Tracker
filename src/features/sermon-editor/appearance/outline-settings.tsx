"use client";

import type { Editor } from "@tiptap/react";
import { Eye, EyeOff, ListOrdered, Palette, PanelTop, RotateCcw } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import type { LayerPath, Path } from "@/features/editor-lab/styles/draft";
import {
  componentKinds,
  latestPresetRevision,
  namedStyles,
  type ComponentKind,
  type NamedStyle,
  type UserPresetId,
} from "@/features/editor-lab/styles/model";
import { presetRevised } from "@/features/editor-lab/styles/presets";
import {
  componentLayers,
  namedLayers,
  resolveComponent,
  resolveNamed,
  type Layer,
} from "@/features/editor-lab/styles/resolve";
import { maxDepth } from "@/features/editor-lab/v4/model";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { PresetChooser, SessionFields, SessionFooter } from "./controls";
import { blockGroups, defaultsGroups, levelGroups, typeGroups } from "./fields";
import { AppearanceModal } from "./modal";
import { HeaderFooterSettings } from "./header-footer-settings";
import { NumberingSettings } from "./numbering-settings";
import {
  AppearancePreview,
  pagesSample,
  sampleIds,
  sampleLevelIds,
  sampleOutline,
} from "./preview";
import { OutlineResets } from "./resets-menu";
import { useAppearanceSession, type AppearanceSession } from "./session";
import { OutlinePresets } from "@/features/appearance-presets/components/outline-presets";

/*
 * Outline Settings (A1-UI.2B.2): the home of everything configured for the
 * outline that is open, never the account. Its categories are
 * `outlineSettingsCategories`, and only one that works is listed (no
 * placeholders): Appearance, and since A4.2A Numbering. Page Setup, Header &
 * Footer, and Printing join them in their own checkpoints, reusing the
 * commands and state their current controls already use.
 *
 * Every category edits one session and one draft (`useAppearanceSession`):
 * moving between categories or tabs keeps every pending edit, the preview
 * shows them all, and one Apply writes them in one transaction (one undo
 * step), or nothing.
 *
 * Appearance has three tabs: Outline (the preset, the shared defaults, the
 * text styles), Components (every component of one type), and Levels (the
 * points at one depth, A4.2A). A single component is customized in Component
 * Appearance instead. Numbering is what the numbers say; how they look is
 * Appearance's (Components and Levels).
 */

export const outlineSettingsCategories = ["appearance", "numbering", "headerFooter"] as const;
export type OutlineSettingsCategory = (typeof outlineSettingsCategories)[number];
export type AppearanceTab = "outline" | "components" | "levels";
export type OutlineTarget = "defaults" | NamedStyle;

const categoryIcons = {
  appearance: Palette,
  numbering: ListOrdered,
  headerFooter: PanelTop,
} as const;

export type OutlineSettingsOptions = {
  category?: OutlineSettingsCategory;
  tab?: AppearanceTab;
  textStyle?: OutlineTarget;
  kind?: ComponentKind;
  depth?: number;
};

/** The levels offered: the first eight, and any deeper one the outline uses (A4.2A). */
function levelChoices(editor: Editor): { depths: number[]; used: Set<number> } {
  const used = new Set<number>();
  editor.state.doc.forEach((block) => {
    if (block.type.name === "point" && !block.attrs.role) used.add(block.attrs.depth as number);
  });
  const deepest = Math.min(maxDepth, Math.max(8, ...used));
  return { depths: Array.from({ length: deepest }, (_, index) => index + 1), used };
}

export function OutlineSettings({
  editor,
  onClose,
  initial = {},
}: {
  editor: Editor;
  onClose: () => void;
  initial?: OutlineSettingsOptions;
}) {
  const t = useT("editorLab");
  const a = t.appearance;
  const session = useAppearanceSession(editor);
  const [category, setCategory] = useState<OutlineSettingsCategory>(
    initial.category ?? "appearance",
  );
  const [tab, setTab] = useState<AppearanceTab>(initial.tab ?? "outline");
  const [textStyle, setTextStyle] = useState<OutlineTarget>(initial.textStyle ?? "normal");
  const [kind, setKind] = useState<ComponentKind>(initial.kind ?? "point");
  const [depth, setDepth] = useState<number>(initial.depth ?? 1);
  const [showPreview, setShowPreview] = useState(true);
  const sample = useMemo(() => sampleOutline(a.sample), [a.sample]);
  // Header & Footer is seen on pages (A4.3): two of them, with the header and the numbers.
  const pagesOf = useMemo(() => pagesSample(a.sample), [a.sample]);
  const asPages = category === "headerFooter";
  const tabsName = useId();

  const appearance = category === "appearance";
  const mark = !appearance
    ? null
    : tab === "components"
      ? sampleIds[kind]
      : tab === "levels"
        ? (sampleLevelIds[depth as 1 | 2 | 3] ?? null)
        : null;
  const caption = !appearance
    ? a.previewOutline
    : tab === "components"
      ? a.previewKind(a.kinds[kind])
      : tab === "levels"
        ? a.previewLevel(depth)
        : a.previewOutline;

  return (
    <AppearanceModal
      session={session}
      onClose={onClose}
      title={a.settingsTitle}
      description={a.settingsHint}
      testId="outline-settings"
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* The categories: a rail from `md`, a row above the settings on a phone. */}
        <nav
          aria-label={a.categoriesLabel}
          className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 py-2 md:w-48 md:flex-col md:border-r md:border-b-0 md:py-3"
        >
          {outlineSettingsCategories.map((each) => {
            const Icon = categoryIcons[each];
            return (
              <button
                key={each}
                type="button"
                aria-current={category === each ? "page" : undefined}
                data-category={each}
                onClick={() => setCategory(each)}
                className="flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary pointer-coarse:min-h-11"
              >
                <Icon className="size-4" aria-hidden />
                {a.categories[each]}
              </button>
            );
          })}
        </nav>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain md:flex-row md:overflow-hidden">
          {/* One preview: above the settings on a phone (and can be hidden), beside them from `md`. */}
          <div
            className={cn(
              "shrink-0 p-3 md:order-last md:flex md:w-[46%] md:flex-col md:border-l md:p-4",
              showPreview ? "h-64" : "h-auto",
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
              content={asPages ? pagesOf : sample}
              pages={asPages}
              mark={mark}
              caption={caption}
              className={cn(
                "h-[calc(100%-2.5rem)] md:h-full md:flex-1",
                !showPreview && "max-md:hidden",
              )}
            />
          </div>

          <div className="relative flex min-w-0 flex-col gap-4 p-4 sm:px-5 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain">
            {appearance ? (
              <>
                <div>
                  <Segmented
                    label={a.tabsLabel}
                    hideLabel
                    name={tabsName}
                    value={tab}
                    onChange={setTab}
                    options={(["outline", "components", "levels"] as const).map((value) => ({
                      value,
                      label: a.tabs[value],
                    }))}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">{a.tabHints[tab]}</p>
                </div>
                {tab === "outline" ? (
                  <OutlineTab session={session} textStyle={textStyle} onTextStyle={setTextStyle} />
                ) : tab === "components" ? (
                  <ComponentsTab session={session} kind={kind} onKind={setKind} />
                ) : (
                  <LevelsTab session={session} depth={depth} onDepth={setDepth} />
                )}
              </>
            ) : category === "numbering" ? (
              <NumberingSettings session={session} />
            ) : (
              <HeaderFooterSettings session={session} />
            )}
          </div>
        </div>
      </div>
      <SessionFooter
        session={session}
        start={<OutlineResets session={session} offer={["allComponents", "preset", "original"]} />}
      />
    </AppearanceModal>
  );
}

function OutlineTab({
  session,
  textStyle,
  onTextStyle,
}: {
  session: AppearanceSession;
  textStyle: OutlineTarget;
  onTextStyle: (target: OutlineTarget) => void;
}) {
  const t = useT("editorLab");
  const a = t.appearance;
  const { merged, preset, presetId } = session;
  const layerPath: LayerPath =
    textStyle === "defaults" ? { layer: "defaults" } : { layer: "named", name: textStyle };
  const layers: Layer[] =
    textStyle === "defaults"
      ? [
          { source: "presetDefaults", values: preset.defaults },
          { source: "defaults", values: merged?.defaults },
        ]
      : namedLayers(merged, textStyle, null, preset);
  const resolved =
    textStyle === "defaults"
      ? { ...preset.defaults, ...(merged?.defaults ?? {}) }
      : resolveNamed(merged, textStyle, null, preset);
  /*
   * Choosing a preset draws it in its latest revision (A4.2A), written with
   * it; an outline drawn by an earlier revision is offered the update and
   * never given it by itself.
   */
  const choose = (id: UserPresetId) =>
    session.setMany([
      [{ layer: "preset" }, id],
      [{ layer: "presetRevision" }, latestPresetRevision],
    ]);
  const revised = presetId !== "baseline" && presetRevised(presetId, merged?.presetRevision);
  return (
    <>
      <PresetChooser
        value={presetId}
        onChange={choose}
        conflict={session.conflictFor({ layer: "preset" })}
        update={revised ? () => choose(presetId as UserPresetId) : undefined}
      />
      {/* The account's own presets (A4.2C), where the host provides them. */}
      <OutlinePresets session={session} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{a.textStyle}</span>
        <Select
          label={a.textStyle}
          value={textStyle}
          onChange={(value) => onTextStyle(value as OutlineTarget)}
          options={[
            { value: "defaults", label: a.sharedDefaults },
            ...namedStyles.map((name) => ({ value: name, label: t.format.styleNames[name] })),
          ]}
        />
      </div>
      <SessionFields
        key={textStyle}
        session={session}
        groups={textStyle === "defaults" ? defaultsGroups : blockGroups}
        layers={layers}
        ownSource={textStyle === "defaults" ? "defaults" : "style"}
        resolved={resolved}
        pathOf={(field) => ({ ...layerPath, field }) as Path}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => session.reset(layerPath)}
      >
        <RotateCcw aria-hidden /> {a.resetTextStyle}
      </Button>
    </>
  );
}

function ComponentsTab({
  session,
  kind,
  onKind,
}: {
  session: AppearanceSession;
  kind: ComponentKind;
  onKind: (kind: ComponentKind) => void;
}) {
  const a = useT("editorLab").appearance;
  const { merged, preset } = session;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{a.componentType}</span>
        <Select
          label={a.componentType}
          value={kind}
          onChange={(value) => onKind(value as ComponentKind)}
          options={componentKinds.map((each) => ({ value: each, label: a.kinds[each] }))}
        />
      </div>
      <SessionFields
        key={kind}
        session={session}
        groups={typeGroups[kind]}
        kind={kind}
        layers={componentLayers(merged, kind, null, preset)}
        ownSource="style"
        resolved={resolveComponent(merged, kind, null, preset)}
        pathOf={(field) => ({ layer: "component", kind, field })}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => session.reset({ layer: "component", kind })}
      >
        <RotateCcw aria-hidden /> {a.resetComponent(a.kinds[kind])}
      </Button>
    </>
  );
}

/**
 * The points at one depth (A4.2A): every property a level may set, each
 * inherited from the main point or subpoint style until it is set here.
 */
function LevelsTab({
  session,
  depth,
  onDepth,
}: {
  session: AppearanceSession;
  depth: number;
  onDepth: (depth: number) => void;
}) {
  const a = useT("editorLab").appearance;
  const { merged, preset } = session;
  const { depths, used } = levelChoices(session.editor);
  const kind: ComponentKind = depth === 1 ? "point" : "subpoint";
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{a.level}</span>
        <Select
          label={a.level}
          value={String(depth)}
          onChange={(value) => onDepth(Number(value))}
          options={depths.map((each) => ({
            value: String(each),
            label: used.has(each) ? a.levelInUse(a.levelOption(each)) : a.levelOption(each),
          }))}
        />
      </div>
      <SessionFields
        key={depth}
        session={session}
        groups={levelGroups}
        kind={kind}
        depth={depth}
        layers={componentLayers(merged, kind, null, preset, depth)}
        ownSource="level"
        resolved={resolveComponent(merged, kind, null, preset, depth)}
        pathOf={(field) => ({ layer: "level", depth, field })}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => session.reset({ layer: "level", depth })}
      >
        <RotateCcw aria-hidden /> {a.resetLevel(depth)}
      </Button>
    </>
  );
}
