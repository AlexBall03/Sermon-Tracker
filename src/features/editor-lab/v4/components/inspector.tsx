"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { parseReference, type ScriptureReference } from "@/features/scripture/reference";
import { useLocale, useT } from "@/i18n/client";
import { JsonPanel } from "../../components/side-panel";
import { layoutNumbering } from "../../layout";
import { insertReference, run, type Command } from "../../outline-commands";
import { insertPassage } from "../commands";
import { loadV4 } from "../extensions";
import { labelsByIndex } from "../numbering";
import { analyze } from "../ownership";

const panels = ["structure", "insert", "json", "checks"] as const;
type Panel = (typeof panels)[number];

/**
 * The lab's inspector beside the sermon workspace: development read-outs and
 * fixture tools, never part of the editor. Everything is read on request or
 * from the editor's state, never sent anywhere.
 */
export function LabInspector({ editor }: { editor: Editor }) {
  const t = useT("editorLab");
  const [panel, setPanel] = useState<Panel>("structure");
  const labels: Record<Panel, string> = {
    structure: t.v4.structure.title,
    insert: t.panel.insert,
    json: t.panel.json,
    checks: t.panel.checks,
  };
  return (
    <aside className="flex min-w-0 flex-col gap-4 rounded-xl border bg-surface p-4 shadow-card">
      <Segmented
        label={t.panel.label}
        hideLabel
        name="lab-v4-panel"
        value={panel}
        onChange={setPanel}
        options={panels.map((value) => ({ value, label: labels[value] }))}
      />
      {panel === "structure" && <StructurePanel editor={editor} />}
      {panel === "insert" && <InsertPanel editor={editor} />}
      {panel === "json" && <JsonPanel editor={editor} />}
      {panel === "checks" && <ChecksPanel editor={editor} />}
    </aside>
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
    <section aria-labelledby="lab-v4-structure" className="text-sm">
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

/** A Scripture passage (a block after the one the caret is in) or an inline reference at the caret. */
function InsertPanel({ editor }: { editor: Editor }) {
  const t = useT("editorLab").insert;
  const locale = useLocale();
  const inputId = useId();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const insert = (make: (reference: ScriptureReference) => Command) => {
    const parsed = parseReference(text, locale);
    if (!parsed.ok) {
      setMessage({ ok: false, text: parsed.message });
      return;
    }
    const done = run(editor, make(parsed.reference));
    setMessage({ ok: done, text: done ? t.inserted : t.notHere });
    if (done) {
      setText("");
      editor.commands.focus();
    }
  };

  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        insert(insertPassage);
      }}
    >
      <label htmlFor={inputId} className="font-semibold">
        {t.scripture}
      </label>
      <p className="text-xs text-muted-foreground">{t.scriptureHint}</p>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={text}
          placeholder={t.scripturePlaceholder}
          onChange={(event) => setText(event.target.value)}
          autoComplete="off"
        />
        <Button type="submit" size="sm" variant="outline" onMouseDown={(e) => e.preventDefault()}>
          {t.insertScripture}
        </Button>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => insert(insertReference)}
      >
        {t.insertInline}
      </Button>
      {message && (
        <p
          role="status"
          data-testid="lab-scripture-message"
          className={message.ok ? "text-primary" : "text-destructive"}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

/** Reloads the document from its own JSON, as opening it again would, and compares. */
function ChecksPanel({ editor }: { editor: Editor }) {
  const t = useT("editorLab").checks;
  const [result, setResult] = useState<{ ok: boolean; text: string; detail: string[] } | null>(
    null,
  );
  const reload = () => {
    const before = editor.getJSON();
    const restored = loadV4(editor, JSON.parse(JSON.stringify(before)));
    if (!restored.ok) {
      setResult({
        ok: false,
        text: t.refused,
        detail: restored.problems.map((p) => `${p.code} ${p.path ?? ""} ${p.detail ?? ""}`),
      });
      return;
    }
    const same = JSON.stringify(editor.getJSON()) === JSON.stringify(before);
    setResult({ ok: same, text: same ? t.reloaded : t.differs, detail: [] });
  };
  return (
    <div className="flex flex-col gap-3">
      <Button variant="outline" size="sm" onClick={reload}>
        {t.run}
      </Button>
      {result && (
        <div role="status" data-testid="lab-check-result" data-ok={result.ok} className="text-sm">
          <p
            className={result.ok ? "font-semibold text-primary" : "font-semibold text-destructive"}
          >
            {result.text}
          </p>
          {result.detail.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
              {result.detail.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
