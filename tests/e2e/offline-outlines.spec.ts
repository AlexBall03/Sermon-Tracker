import { expect, test, type Page } from "@playwright/test";

/**
 * Offline outlines (Phase 5D.2), on the production build, as a guest: the
 * device's copy of an account's sermon and its outline is written here as the
 * downloads would write them, and the outline is then found from the sermon,
 * edited, and opened again with the network cut, through the service worker's
 * offline page at its own addresses. Nothing reaches the server or any
 * account: the account is a made-up ID that exists only in this browser profile.
 */

const owner = "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e";
const sermon = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const outlineId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const first = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const second = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

async function controlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload();
  }
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

/** Writes the account, its sermon, and the sermon's outline into the offline database. */
function seed(page: Page) {
  return page.evaluate(
    async ({ owner, sermon, outlineId, first, second }) => {
      const at = "2026-10-01T10:00:00.000Z";
      const point = (id: string, title: string, position: number) => ({
        id,
        parentId: null,
        type: "point",
        position,
        title,
        notes: null,
        revision: 1,
        references: [],
        sourcePointId: null,
      });
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("sermon-tracker");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(["meta", "accountData"], "readwrite");
      tx.objectStore("meta").put(owner, "activeAccount");
      const data = tx.objectStore("accountData");
      const now = Date.now();
      const done = { status: "idle", complete: true, total: 1, have: 1, completedAt: now };
      data.put({
        owner,
        kind: "idea",
        id: sermon,
        data: {
          server: {
            id: sermon,
            kind: "sermon",
            title: "Grace that is greater",
            notes: null,
            status: "developing",
            intendedFormat: "unspecified",
            sermonType: "unspecified",
            subject: null,
            references: [],
            tagIds: [],
            revision: 2,
            createdAt: at,
            updatedAt: at,
            lastDevelopedAt: null,
            archivedAt: null,
            hasOutline: true,
            preached: false,
          },
          local: null,
        },
        updatedAt: now,
      });
      data.put({ owner, kind: "tags", id: "all", data: [], updatedAt: now });
      data.put({ owner, kind: "state", id: "ideas", data: done, updatedAt: now });
      data.put({
        owner,
        kind: "outline",
        id: outlineId,
        data: {
          server: {
            id: outlineId,
            sermonId: sermon,
            revision: 4,
            numbering: { version: 1, preset: "traditional" },
            createdAt: at,
            updatedAt: at,
            sermon: {
              id: sermon,
              title: "Grace that is greater",
              kind: "sermon",
              status: "developing",
              archivedAt: null,
            },
            sermonReferences: [],
            entries: [point(first, "Grace pardons", 0), point(second, "Grace keeps", 1)],
          },
          local: null,
        },
        updatedAt: now,
      });
      data.put({ owner, kind: "state", id: "outlines", data: done, updatedAt: now });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { owner, sermon, outlineId, first, second },
  );
}

/** The changes queued on the device, for the made-up account. */
function queued(page: Page) {
  return page.evaluate(async (owner) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("sermon-tracker");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = await new Promise<
      { owner: string; type: string; entityId: string; baseRevision?: number; createdAt: number }[]
    >((resolve) => {
      const request = db.transaction("mutations").objectStore("mutations").getAll();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    // Stored by their IDs: put back in the order they were made, as the engine sends them.
    return all.filter((record) => record.owner === owner).sort((a, b) => a.createdAt - b.createdAt);
  }, owner);
}

/** The outline's headings, in the order they are shown. */
const headings = (page: Page) =>
  page
    .getByRole("textbox", { name: /^Heading/ })
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

test("an outline is found from its sermon and edited with no connection", async ({
  page,
  context,
}) => {
  await page.goto("/offline");
  await controlled(page);
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await seed(page);

  await context.setOffline(true);
  // From the sermon kept on the device to its outline, at the outline's own address.
  await page.goto(`/library/${sermon}`);
  await page.getByRole("link", { name: "Open Outline" }).click();
  await expect(page).toHaveURL(new RegExp(`/outlines/${outlineId}`));
  await expect(page.getByText(/copy kept on this device/)).toBeVisible();
  expect(await headings(page)).toEqual(["Grace pardons", "Grace keeps"]);

  // A new point, typed, put under the one before it, then moved to the top.
  await page.getByRole("button", { name: "Add point" }).click();
  await page.keyboard.type("Grace abounds");
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await page
    .getByRole("textbox", { name: /^Heading/ })
    .first()
    .focus();
  await page.keyboard.press("Alt+Shift+ArrowDown");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  expect(await headings(page)).toEqual(["Grace keeps", "Grace abounds", "Grace pardons"]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Opened again with no connection: everything was kept, and is queued in order.
  await page.reload();
  await expect(page.getByText(/copy kept on this device/)).toBeVisible();
  expect(await headings(page)).toEqual(["Grace keeps", "Grace abounds", "Grace pardons"]);
  const records = await queued(page);
  expect(records.every((record) => record.entityId === outlineId)).toBe(true);
  // Each change of shape names the shape the one before it left; the words, the new point's own.
  const shape = records.filter((record) => record.type !== "outline.entry.update");
  expect(shape.map((record) => [record.type, record.baseRevision])).toEqual([
    ["outline.entry.add", 4],
    ["outline.entry.move", 5],
    ["outline.entry.move", 6],
  ]);
  expect(records.filter((record) => record.type === "outline.entry.update")).toEqual([
    expect.objectContaining({ baseRevision: 0 }),
  ]);

  // The outlines overview is the device's too.
  await page.getByRole("link", { name: "Back to your outlines" }).click();
  await expect(page).toHaveURL(/\/outlines$/);
  await expect(page.getByRole("link", { name: /Grace that is greater/ }).first()).toBeVisible();
  await expect(page.getByText(/4 changes are waiting to sync/)).toBeVisible();
});
