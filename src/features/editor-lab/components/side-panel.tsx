"use client";

import { EditorState } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { parseReference, type ScriptureReference } from "@/features/scripture/reference";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { savedPoints } from "../fixtures";
import {
  documentToLegacy,
  legacyToDocument,
  shownOutline,
  type ConversionIssue,
  type Loss,
} from "../legacy";
import { jsonBytes, loadDocument } from "../load";
import { timeIt, type SaveMeter } from "../measure";
import { documentRows, numberingStats } from "../numbering";
import { paginationStats, printLayoutOf } from "../pagination/plugin";
import { addPoint, insertPassage, insertReference, run, type Command } from "../outline-commands";
import { DocumentStylesPanel } from "./document-styles";
import { toolbarRenders } from "./toolbar";

const panels = ["json", "checks", "legacy", "insert", "measure", "styles"] as const;
type Panel = (typeof panels)[number];

type SidePanelProps = {
  editor: Editor;
  issues: ConversionIssue[] | null;
  meter: SaveMeter;
  renders: React.RefObject<{ count: number }>;
};

/** What the lab shows of the document beside it. Everything is read on request, never per keystroke. */
export function SidePanel({ editor, issues, meter, renders }: SidePanelProps) {
  const t = useT("editorLab");
  const [panel, setPanel] = useState<Panel>("json");
  return (
    <aside className="flex min-w-0 flex-col gap-4 rounded-xl border bg-surface p-4 shadow-card">
      <Segmented
        label={t.panel.label}
        hideLabel
        name="lab-panel"
        value={panel}
        onChange={setPanel}
        options={panels.map((value) => ({ value, label: t.panel[value] }))}
      />
      {panel === "json" && <JsonPanel editor={editor} />}
      {panel === "checks" && <ChecksPanel editor={editor} />}
      {panel === "legacy" && <LegacyPanel editor={editor} issues={issues} />}
      {panel === "insert" && <InsertPanel editor={editor} />}
      {panel === "measure" && <MeasurePanel editor={editor} meter={meter} renders={renders} />}
      {panel === "styles" && <DocumentStylesPanel editor={editor} />}
    </aside>
  );
}

export function JsonPanel({ editor }: { editor: Editor }) {
  const t = useT("editorLab").json;
  const locale = useLocale();
  const [json, setJson] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setJson(JSON.stringify(editor.getJSON(), null, 2))}
      >
        {t.refresh}
      </Button>
      {json === null ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground" data-testid="lab-json-size">
            {t.size(formatNumber(locale, new TextEncoder().encode(json).length))}
          </p>
          <pre
            data-testid="lab-json"
            className="max-h-[28rem] overflow-auto rounded-lg bg-secondary p-3 text-xs leading-relaxed"
          >
            {json}
          </pre>
        </>
      )}
    </div>
  );
}

function ChecksPanel({ editor }: { editor: Editor }) {
  const t = useT("editorLab").checks;
  const [result, setResult] = useState<{ text: string; ok: boolean; detail?: string[] } | null>(
    null,
  );

  const reload = () => {
    const before = editor.getJSON();
    const restored = loadDocument(editor, JSON.parse(JSON.stringify(before)));
    if (!restored.ok) {
      setResult({
        ok: false,
        text: t.refused,
        detail: restored.problems.map((p) => `${p.code} ${p.path ?? ""} ${p.detail ?? ""}`),
      });
      return;
    }
    const same = JSON.stringify(editor.getJSON()) === JSON.stringify(before);
    const warnings = restored.warnings.map((p) => `${p.code} ${p.path ?? ""}`);
    setResult({
      ok: same,
      text: same ? (warnings.length ? `${t.reloaded} ${t.warnings}` : t.reloaded) : t.differs,
      detail: warnings,
    });
  };

  const legacy = () => {
    const first = documentToLegacy(editor.getJSON());
    const again = legacyToDocument(first.outline);
    const second = again.ok ? documentToLegacy(again.doc) : null;
    const same =
      second !== null &&
      JSON.stringify(shownOutline(second.outline)) === JSON.stringify(shownOutline(first.outline));
    setResult({
      ok: same,
      text: same ? t.legacyIdentical : t.legacyDiffers,
      detail: first.losses.map((loss) => `${loss.code}${loss.entryId ? ` · ${loss.entryId}` : ""}`),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Button variant="outline" size="sm" onClick={reload}>
        {t.run}
      </Button>
      <Button variant="outline" size="sm" onClick={legacy}>
        {t.legacyRun}
      </Button>
      {result && (
        <div role="status" data-testid="lab-check-result" data-ok={result.ok} className="text-sm">
          <p
            className={result.ok ? "font-semibold text-primary" : "font-semibold text-destructive"}
          >
            {result.text}
          </p>
          {result.detail && result.detail.length > 0 && (
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

function LegacyPanel({ editor, issues }: { editor: Editor; issues: ConversionIssue[] | null }) {
  const t = useT("editorLab").legacy;
  const locale = useLocale();
  const [result, setResult] = useState<{ entries: number; losses: Loss[] } | null>(null);
  return (
    <div className="flex flex-col gap-4 text-sm">
      <section>
        <h3 className="mb-1 font-semibold">{t.issues}</h3>
        {issues === null ? (
          <p className="text-muted-foreground">{t.nativeFixture}</p>
        ) : issues.length === 0 ? (
          <p className="text-muted-foreground">{t.noIssues}</p>
        ) : (
          <ul className="list-disc pl-5 text-xs" data-testid="lab-issues">
            {issues.map((issue, index) => (
              <li key={index}>
                {issue.code}
                {issue.entryId && ` · ${issue.entryId}`}
                {issue.detail && ` → ${issue.detail}`}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const back = documentToLegacy(editor.getJSON());
          setResult({ entries: back.outline.entries.length, losses: back.losses });
        }}
      >
        {t.run}
      </Button>
      {result && (
        <section data-testid="lab-legacy-result">
          <p className="font-semibold">{t.entries(formatNumber(locale, result.entries))}</p>
          <h3 className="mt-2 mb-1 font-semibold">{t.losses}</h3>
          {result.losses.length === 0 ? (
            <p className="text-muted-foreground">{t.noLosses}</p>
          ) : (
            <ul className="list-disc pl-5 text-xs">
              {result.losses.map((loss, index) => (
                <li key={index} className="break-words">
                  {loss.code}
                  {loss.entryId && ` · ${loss.entryId}`}
                  {loss.detail && ` · ${loss.detail}`}
                  {loss.text && ` · “${loss.text.slice(0, 60)}”`}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

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
    <div className="flex flex-col gap-5 text-sm">
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{t.savedPoints}</h3>
        <p className="text-xs text-muted-foreground">{t.savedPointHint}</p>
        {savedPoints.map((point) => (
          <Button
            key={point.id}
            variant="outline"
            size="sm"
            className="justify-start text-left whitespace-normal"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              // A copy of what the saved point holds; the saved point itself is never touched.
              run(
                editor,
                addPoint("sibling", {
                  title: point.title,
                  notes: point.notes,
                  references: point.references.map((reference) => ({ ...reference })),
                  sourcePointId: point.id,
                }),
              );
              editor.commands.focus();
            }}
          >
            {t.insertSaved(point.title)}
          </Button>
        ))}
      </section>
      <form
        className="flex flex-col gap-2"
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
          <Button
            type="submit"
            size="sm"
            variant="outline"
            onMouseDown={(event) => event.preventDefault()}
          >
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
    </div>
  );
}

type Measurement = {
  entries: number;
  bytes: number;
  getJson: number;
  reload: number;
  numbering: number;
  passes: number;
  renders: number;
  toolbar: number;
  saves: number;
  savedBytes: number;
  ready: number | null;
  pages: number | null;
  pagination: number;
  paginationSlowest: number;
  paginationRuns: number;
  paginationPasses: number;
};

function MeasurePanel({
  editor,
  meter,
  renders,
}: {
  editor: Editor;
  meter: SaveMeter;
  renders: React.RefObject<{ count: number }>;
}) {
  const t = useT("editorLab").measure;
  const locale = useLocale();
  const [result, setResult] = useState<Measurement | null>(null);

  const measure = () => {
    const json = editor.getJSON();
    const plugins = editor.state.plugins;
    setResult({
      entries: documentRows(editor.state.doc).length,
      bytes: jsonBytes(json),
      getJson: timeIt(() => editor.getJSON()),
      // A fresh state from the JSON, as a reload builds it; not applied.
      reload: timeIt(() => EditorState.create({ doc: editor.schema.nodeFromJSON(json), plugins })),
      numbering: numberingStats.lastMs,
      passes: numberingStats.builds,
      renders: renders.current.count,
      toolbar: toolbarRenders.count,
      saves: meter.saves,
      savedBytes: meter.bytes,
      ready: meter.readyMs,
      pages: printLayoutOf(editor.state)?.layout === "print" ? paginationStats.pages : null,
      pagination: paginationStats.lastMs,
      paginationSlowest: paginationStats.slowestMs,
      paginationRuns: paginationStats.runs,
      paginationPasses: paginationStats.passes,
    });
  };

  const ms = (value: number | null) => (value === null ? "–" : t.ms(value.toFixed(2)));
  const number = (value: number) => formatNumber(locale, value);
  const rows: [string, string, string][] = result
    ? [
        ["entries", t.entries, number(result.entries)],
        ["bytes", t.jsonBytes, number(result.bytes)],
        ["getJson", t.getJson, ms(result.getJson)],
        ["reload", t.reload, ms(result.reload)],
        ["numbering", t.numbering, ms(result.numbering)],
        ["passes", t.numberingPasses, number(result.passes)],
        ["renders", t.renders, number(result.renders)],
        ["toolbar", t.toolbarRenders, number(result.toolbar)],
        ["saves", t.saves, number(result.saves)],
        ["savedBytes", t.savedBytes, number(result.savedBytes)],
        ["ready", t.loaded, ms(result.ready)],
        ["pages", t.pages, result.pages === null ? "–" : number(result.pages)],
        ["pagination", t.pagination, ms(result.pagination)],
        ["paginationSlowest", t.paginationSlowest, ms(result.paginationSlowest)],
        ["paginationRuns", t.paginationRuns, number(result.paginationRuns)],
        ["paginationPasses", t.paginationPasses, number(result.paginationPasses)],
      ]
    : [];

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-muted-foreground">{t.hint}</p>
      <Button variant="outline" size="sm" onClick={measure}>
        {t.run}
      </Button>
      {result && (
        <dl
          className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-xs"
          data-testid="lab-measurements"
        >
          {rows.map(([key, label, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd
                className="text-right tabular-nums"
                data-measure={key}
                data-value={String(result[key as keyof Measurement] ?? "")}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
