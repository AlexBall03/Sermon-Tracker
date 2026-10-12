import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import { emptyDraft, type IdeaDraft } from "../schemas";
import { ClassificationSection } from "./classification-section";

function Form({ start, locale = "en" }: { start: Partial<IdeaDraft>; locale?: Locale }) {
  const [draft, setDraft] = useState<IdeaDraft>({ ...emptyDraft, ...start });
  return (
    <I18nProvider locale={locale}>
      <ClassificationSection draft={draft} update={setDraft} />
      <output>{`${draft.status}/${draft.intendedFormat}/${draft.sermonType}`}</output>
    </I18nProvider>
  );
}

const toggle = (name = /Classification & Status/) => screen.getByRole("button", { name });

async function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  const item = await screen.findByRole("option", { name: option });
  fireEvent.pointerDown(item, { pointerType: "mouse" });
  fireEvent.mouseMove(item);
  fireEvent.pointerUp(item, { pointerType: "mouse" });
  fireEvent.mouseUp(item);
  fireEvent.click(item);
}

describe("ClassificationSection", () => {
  it("is closed until wanted, and says what the classifications are in one line", () => {
    render(
      <Form
        start={{
          kind: "sermon",
          status: "developing",
          intendedFormat: "full_length",
          sermonType: "textual",
        }}
      />,
    );
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveTextContent("Developing · Full-Length · Textual");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "Development status" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Intended format" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Sermon type" })).toBeVisible();
  });

  it("leaves what was never chosen out of the line", () => {
    render(<Form start={{ kind: "sermon" }} />);
    expect(toggle()).toHaveTextContent(/Classification & Status\s*Idea$/);
  });

  it("gives a point its status only, and keeps what its record holds", async () => {
    render(
      <Form
        start={{ kind: "point", status: "ready", intendedFormat: "mini", sermonType: "topical" }}
      />,
    );
    expect(toggle()).toHaveTextContent(/Ready$/);
    fireEvent.click(toggle());
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "What the sermon types mean" })).toBeNull();

    await choose("Development status", "On Hold");
    expect(screen.getByRole("status")).toHaveTextContent("on_hold/mini/topical");
  });

  it("changes one classification and leaves the others, and keeps them when closed", async () => {
    render(<Form start={{ kind: "sermon", status: "ready", sermonType: "topical" }} />);
    fireEvent.click(toggle());
    await choose("Intended format", "Flexible");
    expect(screen.getByRole("status")).toHaveTextContent("ready/flexible/topical");
    fireEvent.click(toggle());
    expect(toggle()).toHaveTextContent("Ready · Flexible · Topical");
    expect(screen.getByRole("status")).toHaveTextContent("ready/flexible/topical");
  });

  it("explains the sermon types on request, with examples", async () => {
    render(<Form start={{ kind: "sermon" }} />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "What the sermon types mean" }));
    const guide = await screen.findByRole("dialog", { name: "Sermon types" });
    expect(guide).toHaveTextContent("The Importance of Prayer");
    expect(guide).toHaveTextContent("1 Samuel 17:29");
    expect(guide).toHaveTextContent("Psalm 23");
    expect(guide).toHaveTextContent(/can show traits of more than one/);
  });

  it("says it all in Spanish", async () => {
    render(
      <Form locale="es" start={{ kind: "sermon", status: "on_hold", sermonType: "expository" }} />,
    );
    const spanish = toggle(/Clasificación y estado/);
    expect(spanish).toHaveTextContent("En pausa · Expositivo");
    fireEvent.click(spanish);
    fireEvent.click(screen.getByRole("button", { name: "Qué significan los tipos de sermón" }));
    expect(await screen.findByRole("dialog", { name: "Tipos de sermón" })).toHaveTextContent(
      "¿Acaso no hay una causa?",
    );
  });
});
