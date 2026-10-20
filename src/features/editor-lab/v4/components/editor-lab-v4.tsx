"use client";

import Link from "next/link";
import { useState } from "react";

import { Select } from "@/components/ui/select";
import { SermonWorkspace } from "@/features/sermon-editor/sermon-workspace";
import { useT } from "@/i18n/client";
import { routes } from "@/lib/site";
import { PrototypeBadge } from "../../components/editor-lab";
import { DefaultLayoutSelect } from "../../components/page-view";
import { labFixture, labFixtureIds, type LabFixtureId } from "../../load";
import { v4Fixtures, type V4FixtureId } from "../fixtures";
import { LabInspector } from "./inspector";

/** Every document the lab opens: v4's own, and every v3 lab document, migrated as it opens. */
const fixtureIds = [...(Object.keys(v4Fixtures) as V4FixtureId[]), ...labFixtureIds] as const;
type FixtureId = (typeof fixtureIds)[number];

const isV4 = (id: FixtureId): id is V4FixtureId => id in v4Fixtures;

/** A key for each document opened, so copying from one and pasting in another is a paste between documents. */
let opened = 0;
const open = (id: FixtureId) => ({
  id,
  key: `lab-v4:${id}:${(opened += 1)}`,
  json: isV4(id) ? v4Fixtures[id] : labFixture(id).doc,
});

/**
 * The development lab around the sermon editor (A1, /lab/editor/v4): the
 * editor itself is `SermonWorkspace` (`src/features/sermon-editor`); the
 * lab adds only what is the lab's: the fixture picker, the prototype badge,
 * the device's default layout (a stand-in for Settings), a way to the v3
 * baseline, and the inspector. Nothing is saved, synced, or sent.
 *
 * Opening another fixture mounts a new workspace (its `key`), as opening
 * another sermon would.
 */
export function EditorLabV4() {
  const t = useT("editorLab");
  const [opening, setOpening] = useState(() => open("parentProse"));
  const label = (id: FixtureId) =>
    isV4(id) ? t.v4.fixtures[id] : t.v4.migrated(t.fixtures[id as LabFixtureId]);

  return (
    <SermonWorkspace
      key={opening.key}
      document={opening.json}
      documentKey={opening.key}
      back={{ href: routes.outlines, label: t.workspace.back }}
      headerStart={
        <>
          <Select
            label={t.v4.fixture}
            value={opening.id}
            onChange={(value) => {
              setOpening(open(value as FixtureId));
            }}
            options={fixtureIds.map((id) => ({ value: id, label: label(id) }))}
            className="w-full max-w-xs border-transparent bg-transparent font-medium shadow-none hover:border-border"
          />
          <PrototypeBadge notice={t.v4.notice} limitations={t.v4.limitations} />
          <Link
            href="/lab/editor"
            className="hidden shrink-0 text-xs text-primary underline-offset-4 hover:underline sm:inline"
          >
            {t.v4.baseline}
          </Link>
        </>
      }
      headerEnd={<DefaultLayoutSelect className="w-44" />}
      aside={(editor) => <LabInspector editor={editor} />}
    />
  );
}
