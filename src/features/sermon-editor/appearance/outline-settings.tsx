"use client";

import type { Editor } from "@tiptap/react";
import { Eye, EyeOff, Palette, RotateCcw } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import type { LayerPath, Path } from "@/features/editor-lab/styles/draft";
import {
  componentKinds,
  namedStyles,
  type ComponentKind,
  type NamedStyle,
} from "@/features/editor-lab/styles/model";
import {
  componentLayers,
  namedLayers,
  resolveComponent,
  resolveNamed,
  type Layer,
} from "@/features/editor-lab/styles/resolve";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { PresetChooser, SessionFields, SessionFooter } from "./controls";
import { blockGroups, componentGroups } from "./fields";
import { AppearanceModal } from "./modal";
import { AppearancePreview, sampleIds, sampleOutline } from "./preview";
import { OutlineResets } from "./resets-menu";
import { useAppearanceSession, type AppearanceSession } from "./session";

/*
 * Outline Settings (A1-UI.2B.2): the home of everything configured for the
 * outline that is open, never the account. Its categories are
 * `outlineSettingsCategories`, and only one that works is listed (no
 * placeholders). Today that is Appearance; Page Setup, Numbering, Header &
 * Footer, and Printing join it in their own checkpoints, reusing the commands
 * and state their current controls already use.
 *
 * Appearance has two tabs over one draft: Outline (the preset, the shared
 * defaults, the text styles) and Components (every component of one type).
 * A single component is customized in Component Appearance instead.
 */

export const outlineSettingsCategories = ["appearance"] as const;
export type OutlineSettingsCategory = (typeof outlineSettingsCategories)[number];
export type AppearanceTab = "outline" | "components";
export type OutlineTarget = "defaults" | NamedStyle;

const categoryIcons = { appearance: Palette } as const;

export type OutlineSettingsOptions = {
  tab?: AppearanceTab;
  textStyle?: OutlineTarget;
  kind?: ComponentKind;
};

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
  const [category, setCategory] = useState<OutlineSettingsCategory>("appearance");
  const [tab, setTab] = useState<AppearanceTab>(initial.tab ?? "outline");
  const [textStyle, setTextStyle] = useState<OutlineTarget>(initial.textStyle ?? "normal");
  const [kind, setKind] = useState<ComponentKind>(initial.kind ?? "point");
  const [showPreview, setShowPreview] = useState(true);
  const sample = useMemo(() => sampleOutline(a.sample), [a.sample]);
  const tabsName = useId();

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
                onClick={() => setCategory(each)}
                className="flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary pointer-coarse:min-h-11"
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
              content={sample}
              mark={tab === "components" ? sampleIds[kind] : null}
              caption={tab === "components" ? a.previewKind(a.kinds[kind]) : a.previewOutline}
              className={cn(
                "h-[calc(100%-2.5rem)] md:h-full md:flex-1",
                !showPreview && "max-md:hidden",
              )}
            />
          </div>

          <div className="relative flex flex-col gap-4 p-4 sm:px-5 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain">
            <div>
              <Segmented
                label={a.tabsLabel}
                hideLabel
                name={tabsName}
                value={tab}
                onChange={setTab}
                options={(["outline", "components"] as const).map((value) => ({
                  value,
                  label: a.tabs[value],
                }))}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">{a.tabHints[tab]}</p>
            </div>
            {tab === "outline" ? (
              <OutlineTab session={session} textStyle={textStyle} onTextStyle={setTextStyle} />
            ) : (
              <ComponentsTab session={session} kind={kind} onKind={setKind} />
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
  return (
    <>
      <PresetChooser
        value={presetId}
        onChange={(id) => session.set({ layer: "preset" }, id)}
        conflict={session.conflictFor({ layer: "preset" })}
      />
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
        groups={blockGroups}
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
        groups={componentGroups[kind]}
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
