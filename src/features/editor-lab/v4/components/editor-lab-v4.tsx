"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { undo } from "@tiptap/pm/history";
import {
  ArrowDown,
  ArrowLeftToLine,
  ArrowUp,
  Bold,
  CircleSlash,
  Italic,
  ListIndentDecrease,
  ListIndentIncrease,
  ListPlus,
  ListTree,
  PanelBottom,
  PanelTop,
  Pilcrow,
  Plus,
  Redo2,
  Trash,
  Underline,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import type { editorLab } from "@/i18n/dictionaries/en/editorLab";
import { useLocale, useT } from "@/i18n/client";
import { documentFixtures, type DocumentFixtureId } from "../../documents";
import { labFontVariables } from "../../fonts";
import { powerOfGodsWord } from "../../fixtures";
import { layoutNumbering } from "../../layout";
import { pageMetrics, papers } from "../../pagination/geometry";
import { layoutModes, printLayoutOf, type LayoutMode } from "../../pagination/plugin";
import { initialPrintLayout } from "../../pagination/preferences";
import { run, type Command } from "../../outline-commands";
import { PageScaler } from "../../components/page-scaler";
import { Tool } from "../../components/toolbar";
import { namedStyles } from "../../styles/model";
import {
  addPoint,
  decreaseLevel,
  deletePointGroup,
  increaseLevel,
  moveGroup,
  moveOut,
  pointToProse,
  proseToPoint,
  setPointStyle,
  setRole,
} from "../commands";
import { labV4Extensions, loadV4 } from "../extensions";
import { v4Fixtures, type V4FixtureId } from "../fixtures";
import type { V4Notice } from "../model";
import { labelsByIndex } from "../numbering";
import { analyze } from "../ownership";
import { presentations, setPresentation, type Presentation } from "../plugins";
import "../../lab.css";
import "../lab-v4.css";

/** The documents the v4 lab opens: its own, and v3's migrated as they load. */
const migratedIds = ["lampAndPath", "sectionsAnywhere", "printLayout", "stylesAndScript"] as const;
const fixtureIds = [
  ...(Object.keys(v4Fixtures) as V4FixtureId[]),
  ...migratedIds,
  "powerOfGodsWord",
] as const;
type FixtureId = (typeof fixtureIds)[number];

const fixtureJson = (id: FixtureId) =>
  id === "powerOfGodsWord"
    ? powerOfGodsWord
    : id in v4Fixtures
      ? v4Fixtures[id as V4FixtureId]
      : documentFixtures[id as DocumentFixtureId];

let opened = 0;
const keyFor = (id: FixtureId) => `lab-v4:${id}:${(opened += 1)}`;

/**
 * The schema v4 lab (architecture-validation prototype): one editor over a
 * fixture, the structure actions, the presentation switch, and a read-out
 * of who owns each block. Nothing is saved, synced, or sent.
 */
export function EditorLabV4() {
  const t = useT("editorLab");
  const v4 = t.v4;
  const locale = useLocale();
  const [fixture, setFixture] = useState<FixtureId>("parentProse");
  const [notice, setNotice] = useState<V4Notice | null>(null);
  const [layout, setLayout] = useState<LayoutMode>("regular");
  const [presentation, choosePresentation] = useState<Presentation>("outline");
  const extensions = useMemo(
    () =>
      labV4Extensions({
        locale,
        onNotice: (next) => setNotice(next),
        printLayout: { initial: initialPrintLayout },
      }),
    [locale],
  );

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: "lab-editor",
        "aria-label": t.editorLabel,
        "aria-multiline": "true",
        role: "textbox",
        spellcheck: "true",
        "data-testid": "lab-v4-editor",
      },
    },
    onCreate: ({ editor: created }) => {
      loadV4(created, fixtureJson("parentProse"), keyFor("parentProse"));
      const current = printLayoutOf(created.state);
      if (current) setLayout(current.layout);
    },
  });

  const open = (id: FixtureId) => {
    if (!editor) return;
    loadV4(editor, fixtureJson(id), keyFor(id));
    setFixture(id);
    setNotice(null);
  };

  const fixtureLabel = (id: FixtureId) =>
    id in v4Fixtures
      ? v4.fixtures[id as V4FixtureId]
      : v4.migrated(t.fixtures[id as keyof typeof t.fixtures]);

  const setup = editor ? printLayoutOf(editor.state)?.setup : undefined;

  return (
    <div className={`${labFontVariables} flex flex-col gap-4`} data-testid="editor-lab-v4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          label={v4.fixture}
          value={fixture}
          onChange={(value) => open(value as FixtureId)}
          options={fixtureIds.map((id) => ({ value: id, label: fixtureLabel(id) }))}
          className="w-full max-w-sm"
        />
        <Segmented
          label={v4.presentation}
          name="lab-v4-presentation"
          value={presentation}
          onChange={(value) => {
            if (!editor) return;
            setPresentation(editor.view, value);
            choosePresentation(value);
          }}
          options={presentations.map((value) => ({ value, label: v4.presentations[value] }))}
        />
        <Segmented
          label={t.print.layout}
          name="lab-v4-layout"
          value={layout}
          onChange={(value) => {
            if (!editor) return;
            editor.commands.setLayout(value);
            setLayout(value);
          }}
          options={layoutModes.map((mode) => ({ value: mode, label: t.print.layouts[mode] }))}
        />
        <Link
          href="/lab/editor"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {v4.baseline}
        </Link>
      </div>

      {editor && <StructureToolbar editor={editor} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div
          className={
            layout === "print" ? "lab-desk overflow-auto py-4" : "rounded-xl border bg-surface"
          }
        >
          <PageScaler layout={layout} pageWidth={setup ? pageMetrics(setup).width : 0}>
            <EditorContent editor={editor} className="lab-surface" />
          </PageScaler>
          {layout === "print" && setup && (
            <style>{`@media print { @page { size: ${papers[setup.size].css}; margin: 0; } }`}</style>
          )}
        </div>
        {editor && <StructurePanel editor={editor} />}
      </div>

      <div className="flex flex-col gap-2">
        {notice && editor && (
          <p
            role="status"
            data-testid="lab-v4-notice"
            className="flex items-center gap-3 text-sm text-gold-ink"
          >
            <span>{noticeText(v4.notices, notice)}</span>
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                undo(editor.state, editor.view.dispatch);
                setNotice(null);
              }}
            >
              {v4.undo}
            </button>
          </p>
        )}
        <p className="text-xs text-muted-foreground">{v4.shortcuts}</p>
        <p className="text-xs text-muted-foreground">{v4.notice}</p>
      </div>
    </div>
  );
}

type Notices = (typeof editorLab)["v4"]["notices"];

function noticeText(notices: Notices, notice: V4Notice): string {
  switch (notice.code) {
    case "point_converted":
      return notices.point_converted(notice.linked);
    case "point_removed":
      return notices.point_removed;
    case "points_deleted":
      return notices.points_deleted(notice.count);
    case "ownership_changed":
      return notices.ownership_changed(notice.count);
    case "role_dropped":
      return notices.role_dropped(notice.role);
  }
}

/** The structure actions, each one command, available only where it applies. */
function StructureToolbar({ editor }: { editor: Editor }) {
  const t = useT("editorLab");
  const v4 = t.v4;
  const can = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const check = (command: Command) => command(e.state);
      return {
        point: check(addPoint("sibling")),
        subpoint: check(addPoint("child")),
        toPoint: check(proseToPoint),
        toProse: check(pointToProse),
        deleteGroup: check(deletePointGroup),
        increase: check(increaseLevel),
        decrease: check(decreaseLevel),
        moveOut: check(moveOut),
        moveUp: check(moveGroup("up")),
        moveDown: check(moveGroup("down")),
        introduction: check(setRole("introduction")),
        conclusion: check(setRole("conclusion")),
        clearRole: check(setRole(null)),
        look: e.state.selection.$from.parent.type.name === "point",
        style: (e.state.selection.$from.parent.attrs.styleName as string | null) ?? "",
      };
    },
  });
  if (!can) return null;
  const command = (c: Command) => () => run(editor, c);
  const a = v4.actions;
  return (
    <div
      role="toolbar"
      aria-label={v4.actionsLabel}
      className="flex flex-wrap items-center gap-1 rounded-xl border bg-surface p-1"
    >
      <Tool label={t.toolbar.undo} icon={Undo2} onPress={() => editor.commands.undo()} />
      <Tool label={t.toolbar.redo} icon={Redo2} onPress={() => editor.commands.redo()} />
      <Tool label={t.toolbar.bold} icon={Bold} onPress={() => editor.commands.toggleBold()} />
      <Tool label={t.toolbar.italic} icon={Italic} onPress={() => editor.commands.toggleItalic()} />
      <Tool
        label={t.toolbar.underline}
        icon={Underline}
        onPress={() => editor.commands.toggleUnderline()}
      />
      <span className="mx-1 h-6 w-px bg-border" aria-hidden />
      <Tool
        label={a.point}
        icon={Plus}
        disabled={!can.point}
        onPress={command(addPoint("sibling"))}
      />
      <Tool
        label={a.subpoint}
        icon={ListPlus}
        disabled={!can.subpoint}
        onPress={command(addPoint("child"))}
      />
      <Tool
        label={a.toPoint}
        icon={ListTree}
        disabled={!can.toPoint}
        onPress={command(proseToPoint)}
      />
      <Tool
        label={a.toProse}
        icon={Pilcrow}
        disabled={!can.toProse}
        onPress={command(pointToProse)}
      />
      <Tool
        label={a.deleteGroup}
        icon={Trash}
        disabled={!can.deleteGroup}
        onPress={command(deletePointGroup)}
      />
      <span className="mx-1 h-6 w-px bg-border" aria-hidden />
      <Tool
        label={a.increase}
        icon={ListIndentIncrease}
        disabled={!can.increase}
        onPress={command(increaseLevel)}
      />
      <Tool
        label={a.decrease}
        icon={ListIndentDecrease}
        disabled={!can.decrease}
        onPress={command(decreaseLevel)}
      />
      <Tool
        label={a.moveOut}
        icon={ArrowLeftToLine}
        disabled={!can.moveOut}
        onPress={command(moveOut)}
      />
      <Tool
        label={a.moveUp}
        icon={ArrowUp}
        disabled={!can.moveUp}
        onPress={command(moveGroup("up"))}
      />
      <Tool
        label={a.moveDown}
        icon={ArrowDown}
        disabled={!can.moveDown}
        onPress={command(moveGroup("down"))}
      />
      <span className="mx-1 h-6 w-px bg-border" aria-hidden />
      <Tool
        label={a.introduction}
        icon={PanelTop}
        disabled={!can.introduction}
        onPress={command(setRole("introduction"))}
      />
      <Tool
        label={a.conclusion}
        icon={PanelBottom}
        disabled={!can.conclusion}
        onPress={command(setRole("conclusion"))}
      />
      <Tool
        label={a.clearRole}
        icon={CircleSlash}
        disabled={!can.clearRole}
        onPress={command(setRole(null))}
      />
      {can.look && (
        <Select
          label={v4.look}
          value={can.style}
          onChange={(value) => run(editor, setPointStyle(value || null))}
          options={[
            { value: "", label: v4.lookComponent },
            ...namedStyles.map((name) => ({ value: name, label: t.format.styleNames[name] })),
          ]}
          className="w-44"
        />
      )}
    </div>
  );
}

/** Who owns each block, read from the document as it stands. */
function StructurePanel({ editor }: { editor: Editor }) {
  const v4 = useT("editorLab").v4;
  const rows = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const structure = analyze(e.state.doc);
      const labels = labelsByIndex(structure, layoutNumbering(e.state.doc.attrs.layout));
      const name = (index: number) => {
        const block = structure.blocks[index];
        const text = block.node.textContent.trim();
        const label = labels.get(index);
        return `${label ? `${label} ` : ""}${text.length > 36 ? `${text.slice(0, 36)}…` : text}`;
      };
      return structure.blocks.map((block, index) => {
        const owner = structure.owner[index];
        return {
          key: `${index}`,
          point: block.isPoint,
          name: name(index),
          depth: block.depth,
          owner: owner === null ? null : name(owner),
          irregular: structure.irregular[index],
        };
      });
    },
  });
  return (
    <section
      aria-labelledby="lab-v4-structure"
      className="rounded-xl border bg-surface p-3 text-sm lg:max-h-[70vh] lg:overflow-auto"
    >
      <h2 id="lab-v4-structure" className="font-semibold">
        {v4.structure.title}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{v4.structure.hint}</p>
      <table className="mt-3 w-full text-left text-xs" data-testid="lab-v4-structure">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-2 font-medium">{v4.structure.block}</th>
            <th className="py-1 pr-2 font-medium">{v4.structure.depth}</th>
            <th className="py-1 font-medium">{v4.structure.owner}</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((row) => (
            <tr key={row.key} className="border-t align-top">
              <td className={row.point ? "py-1 pr-2 font-medium" : "py-1 pr-2"}>
                {row.name || v4.structure.empty}
                {row.irregular && (
                  <span className="ml-1 text-destructive">
                    ({v4.structure.irregular[row.irregular]})
                  </span>
                )}
              </td>
              <td className="py-1 pr-2 tabular-nums">{row.depth}</td>
              <td className="py-1 text-muted-foreground">{row.owner ?? v4.structure.document}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
