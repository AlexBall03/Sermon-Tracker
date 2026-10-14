import { expect, test, type Page } from "@playwright/test";

/**
 * Offline ideas (Phase 5D.1), on the production build, as a guest: the
 * device's copy of an account's ideas is written here as the download would
 * write it, and the library and an idea's page are then used with the network
 * cut, through the service worker's offline page at their own addresses.
 * Nothing reaches the server or any account: the account is a made-up ID that
 * exists only in this browser profile.
 */

const owner = "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e";
const grace = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const hope = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function controlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload();
  }
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

/** Writes the account and its kept ideas into the database the offline page has opened. */
function seed(page: Page) {
  return page.evaluate(
    async ({ owner, grace, hope }) => {
      const idea = (id: string, title: string, kind: string) => ({
        id,
        kind,
        title,
        notes: null,
        status: "idea",
        intendedFormat: "unspecified",
        sermonType: "unspecified",
        subject: null,
        references: [],
        tagIds: [],
        revision: 2,
        createdAt: "2026-10-01T10:00:00.000Z",
        updatedAt: "2026-10-01T10:00:00.000Z",
        lastDevelopedAt: null,
        archivedAt: null,
        hasOutline: false,
        preached: false,
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
      for (const item of [
        idea(grace, "Grace that is greater", "sermon"),
        idea(hope, "Hope", "point"),
      ]) {
        data.put({
          owner,
          kind: "idea",
          id: item.id,
          data: { server: item, local: null },
          updatedAt: now,
        });
      }
      data.put({ owner, kind: "tags", id: "all", data: [], updatedAt: now });
      data.put({
        owner,
        kind: "state",
        id: "ideas",
        data: {
          status: "idle",
          complete: true,
          total: 2,
          have: 2,
          completedAt: now,
          checkedAt: now,
        },
        updatedAt: now,
      });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { owner, grace, hope },
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
    const all = await new Promise<{ owner: string; type: string; baseRevision?: number }[]>(
      (resolve) => {
        const request = db.transaction("mutations").objectStore("mutations").getAll();
        request.onsuccess = () => resolve(request.result);
      },
    );
    db.close();
    return all.filter((record) => record.owner === owner);
  }, owner);
}

test("the library and an idea work from the device's copy with no connection", async ({
  page,
  context,
}) => {
  // The offline page opens (and so creates) the device's database; then the copy is written.
  await page.goto("/offline");
  await controlled(page);
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await seed(page);

  await context.setOffline(true);
  await page.goto("/library/sermon-ideas");
  await expect(page.getByRole("heading", { name: "Sermon Ideas" })).toBeVisible();
  await expect(page.getByText(/copy kept on this device/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Grace that is greater" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Hope" })).toBeVisible();

  // Searching is the device's alone, and the address keeps the query.
  await page.getByRole("searchbox").fill("grace");
  await expect(page.getByRole("link", { name: "Hope" })).toBeHidden();
  await expect(page).toHaveURL(/q=grace/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // An idea opens in the application's own editor, at its own address.
  await page.getByRole("link", { name: "Grace that is greater" }).click();
  await expect(page).toHaveURL(new RegExp(`/library/${grace}`));
  const title = page.getByRole("textbox", { name: "Idea" });
  await expect(title).toHaveValue("Grace that is greater");
  await title.fill("Grace upon grace");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Saved on this device/).first()).toBeVisible();
  expect(await queued(page)).toEqual([
    expect.objectContaining({ type: "idea.update", baseRevision: 2 }),
  ]);

  // Back in the library, the change is there, and it is said to be waiting.
  await page.getByRole("link", { name: "Back to Sermon Ideas" }).click();
  await expect(page.getByRole("link", { name: "Grace upon grace" })).toBeVisible();
  await expect(page.getByText(/1 change is waiting to sync/)).toBeVisible();
});
