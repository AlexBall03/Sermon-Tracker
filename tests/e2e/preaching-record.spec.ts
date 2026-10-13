import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The library's shape and the Preaching Record, signed in.
 *
 * It signs in as `library.spec.ts` does and needs the same account: see the
 * note at the top of that file. Without `E2E_CLERK_USER_EMAIL` every test here
 * is skipped, and says so.
 *
 * The journey works only with a sermon, a venue, a context, and occasions it
 * makes itself, named with a prefix unique to the run, in that account's own
 * library in the development database, and removes them when it finishes.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe.configure({ mode: "serial" });

test.describe("library and preaching record, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(
    Boolean(email) && !development,
    "Signed-in tests run against the development Clerk instance only.",
  );

  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });

  async function signIn(page: Page) {
    // A public page that loads Clerk; the helper signs in from there.
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: email ?? "" });
    await page.goto("/library");
    await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
    // The first page after signing in is shown behind the loading screen.
    await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, {
      timeout: 15_000,
    });
  }

  const sections = [
    { href: "/library/sermon-ideas", name: "Sermon Ideas" },
    { href: "/library/saved-scripture", name: "Saved Scripture" },
    { href: "/library/preaching-record", name: "Preaching Record" },
  ];

  test("the overview leads to each section, each leads back, and old addresses still arrive", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signIn(page);
    const main = page.getByRole("main");

    // The overview is the way in: three sections, nothing marked current, no way up.
    await expect(main.getByRole("link", { name: "Back to Library" })).toHaveCount(0);
    await expect(main.locator('[aria-current="page"]')).toHaveCount(0);

    for (const section of sections) {
      await page.goto("/library");
      await main.locator(`a[href="${section.href}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${section.href}$`));
      await expect(page.getByRole("heading", { level: 1, name: section.name })).toBeVisible();

      // Its own place among the three, and one way back up.
      const nav = main.getByRole("navigation", { name: "Library sections" });
      await expect(nav.getByRole("link")).toHaveCount(3);
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(nav.locator('[aria-current="page"]')).toHaveAttribute("href", section.href);
      const back = main.getByRole("link", { name: "Back to Library" });
      await expect(back).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
      await back.click();
      await expect(page).toHaveURL(/\/library$/);
      await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
    }

    // Addresses from before the sections moved, with what they asked for.
    await page.goto("/library/scripture?q=grace");
    await expect(page).toHaveURL(/\/library\/saved-scripture\?q=grace$/);
    await page.goto("/library/history?time=pm");
    await expect(page).toHaveURL(/\/library\/preaching-record\?time=pm$/);
    await page.goto("/library?q=grace&kind=sermon");
    await expect(page).toHaveURL(/\/library\/sermon-ideas\?q=grace&kind=sermon$/);
    await expect(page.getByRole("searchbox", { name: "Search ideas" })).toHaveValue("grace");
    // An address the ideas query does not know stays on the overview.
    await page.goto("/library?nothing=here");
    await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  });

  test("record a sermon as preached, change it, find it, and keep it through archiving and refiling", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    // Unique to this run and this project, so two runs cannot see each other's records.
    const run = `e2e${Date.now().toString(36)}${testInfo.project.name}`;
    const sermon = `${run} preached sermon`;
    const venue = `${run} chapel`;
    const context = `${run} rally`;

    const rows = () => page.getByRole("list", { name: "Your preaching record" }).locator("> li");
    const record = () =>
      page.getByRole("button", { name: "Record preaching", exact: true }).filter({ visible: true });
    const recordForm = page.getByRole("dialog", { name: "Record preaching" });
    const said = (text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();
    const choose = async (label: string, option: string) => {
      await page.getByRole("combobox", { name: label }).click();
      await page.getByRole("option", { name: option }).click();
    };
    const openSermon = async () => {
      await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(sermon)}&archived=all`);
      await page.getByRole("link", { name: sermon }).click();
      await expect(page.getByRole("textbox", { name: "Idea" })).toHaveValue(sermon);
    };
    const findRecords = async () => {
      await page.goto(`/library/preaching-record?q=${run}`);
      await expect(page.getByRole("heading", { level: 1, name: "Preaching Record" })).toBeVisible();
    };

    await signIn(page);

    try {
      // A sermon to preach: captured, then filed as one.
      await page.goto("/library/sermon-ideas");
      await page
        .getByRole("button", { name: "Capture an idea" })
        .filter({ visible: true })
        .first()
        .click();
      const capture = page.getByRole("dialog", { name: "Capture an idea" });
      await capture.getByRole("textbox", { name: "Idea" }).fill(sermon);
      await capture.getByRole("button", { name: "Save idea" }).click();
      await expect(capture).toBeHidden();
      await openSermon();
      const sermonAddress = page.url().split("?")[0];
      const sermonId = sermonAddress.split("/").pop() ?? "";

      // Until it is a sermon there is nothing to record.
      await expect(record()).toHaveCount(0);
      await page.getByRole("radio", { name: "Sermon" }).check({ force: true });
      await expect(page.getByText("Now filed as: Sermon idea.")).toBeVisible();
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(said("Changes saved.")).toBeVisible();

      // From the Preaching Record: the sermon is chosen in the form, which opens on its search.
      await page.goto("/library/preaching-record");
      await record().first().focus();
      await page.keyboard.press("Enter");
      await expect(recordForm).toBeVisible();
      const picker = recordForm.getByRole("searchbox", { name: "Sermon" });
      await expect(picker).toBeFocused();

      // Sent with no sermon, it says so and records nothing.
      await recordForm.getByRole("button", { name: "Record", exact: true }).click();
      await expect(
        recordForm.getByText("Choose the sermon that was preached.").first(),
      ).toBeVisible();

      await picker.fill(sermon);
      await recordForm.getByRole("button", { name: `Choose ${sermon}` }).click();
      await recordForm.getByRole("radio", { name: "PM", exact: true }).check({ force: true });

      // A venue and a context are made in place, and are then the ones chosen.
      await recordForm.getByRole("button", { name: "New venue" }).click();
      const newVenue = recordForm.getByRole("group", { name: "New venue" });
      await newVenue.getByRole("textbox", { name: "Venue name" }).fill(venue);
      await newVenue.getByRole("textbox", { name: "Town or city" }).fill("Springfield");
      await newVenue.getByRole("button", { name: "Add", exact: true }).click();
      await expect(recordForm.getByRole("combobox", { name: "Venue" })).toContainText(venue);
      await recordForm.getByRole("button", { name: "New context" }).click();
      const newContext = recordForm.getByRole("group", { name: "New context" });
      await newContext.getByRole("textbox", { name: "Context name" }).fill(context);
      await newContext.getByRole("button", { name: "Add", exact: true }).click();
      await expect(recordForm.getByRole("combobox", { name: "Context" })).toContainText(context);

      // A link that is not https is refused before anything is sent.
      await recordForm
        .getByRole("textbox", { name: /^Recording link/ })
        .fill("http://example.com/a");
      await recordForm.getByRole("button", { name: "Record", exact: true }).click();
      await expect(
        recordForm.getByText("Use a link that begins with https://.").first(),
      ).toBeVisible();
      await recordForm.getByRole("textbox", { name: /^Recording link/ }).fill("");
      await recordForm.getByRole("textbox", { name: /^Notes/ }).fill("First time through.");
      await recordForm.getByRole("button", { name: "Record", exact: true }).click();
      await expect(recordForm).toBeHidden();
      await expect(said("Added to your preaching record.")).toBeVisible();

      // Search is the database's, and lives in the address.
      const search = page.getByRole("searchbox", { name: "Search preaching record" });
      await search.fill(venue);
      await expect(page).toHaveURL(/[?&]q=/);
      await expect(rows()).toHaveCount(1);
      await expect(rows().first()).toContainText(sermon);
      await expect(rows().first().getByRole("button")).toHaveAccessibleName(/ PM$/);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);

      // Read it, then change it: AM or PM is optional and can be taken away again.
      await rows().first().getByRole("button").click();
      const details = page.getByRole("dialog", { name: "Record details" });
      await expect(details).toContainText(venue);
      await expect(details).toContainText(context);
      await expect(details).toContainText("PM (Afternoon or evening)");
      await expect(details).toContainText("First time through.");
      await details.getByRole("button", { name: "Edit" }).click();
      const editForm = page.getByRole("dialog", { name: "Edit record" });
      await editForm.getByRole("radio", { name: "Not specified" }).check({ force: true });
      await editForm.getByRole("textbox", { name: /^Notes/ }).fill("Changed afterwards.");
      await editForm.getByRole("button", { name: "Save changes" }).click();
      await expect(editForm).toBeHidden();
      await expect(said("Changes saved.")).toBeVisible();
      await expect(rows().first().getByRole("button")).not.toHaveAccessibleName(/ PM$/);

      // Filters are the address's: the time of day, then one sermon's occasions.
      await page.goto(`/library/preaching-record?q=${run}&time=pm`);
      await expect(page.getByRole("heading", { name: /^No records match/ })).toBeVisible();
      await page.goto(`/library/preaching-record?q=${run}&time=unspecified`);
      await expect(rows()).toHaveCount(1);
      await page.goto(`/library/preaching-record?sermon=${sermonId}`);
      await expect(rows()).toHaveCount(1);
      await expect(
        page.getByRole("button", { name: `Remove filter: Sermon ${sermon}` }),
      ).toBeVisible();
      // Filtered to a sermon, the form already has it.
      await record().first().click();
      await expect(recordForm).toContainText(sermon);
      await expect(recordForm.getByRole("searchbox", { name: "Sermon" })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(recordForm).toBeHidden();
      // A page past the end lands on the last page instead of failing.
      await page.goto(`/library/preaching-record?q=${run}&page=999`);
      await expect(rows()).toHaveCount(1);

      // A venue or a context that the record names is kept.
      await page.getByRole("button", { name: "Manage venues" }).click();
      const venues = page.getByRole("dialog", { name: "Venues" });
      await venues.getByRole("button", { name: `Delete ${venue}` }).click();
      await expect(venues.getByRole("alert")).toContainText(
        "That venue is on 1 record in your preaching record and cannot be deleted.",
      );
      await page.keyboard.press("Escape");
      await expect(venues).toBeHidden();
      await page.getByRole("button", { name: "Manage contexts" }).click();
      const contexts = page.getByRole("dialog", { name: "Contexts" });
      await contexts.getByRole("button", { name: `Delete ${context}` }).click();
      await expect(contexts.getByRole("alert")).toContainText(
        "That context is on 1 record in your preaching record and cannot be deleted.",
      );
      await page.keyboard.press("Escape");
      await expect(contexts).toBeHidden();

      // The sermon's own page: its record, and the form with the sermon already chosen.
      await page.goto(sermonAddress);
      const own = page.getByRole("region", { name: "Preaching record" });
      await expect(own).toContainText("Preached once, on");
      await expect(own.getByRole("list", { name: "Recent preaching" }).locator("> li")).toHaveCount(
        1,
      );
      const fromPage = own.getByRole("button", { name: "Record preaching" });
      await fromPage.focus();
      await page.keyboard.press("Enter");
      await expect(recordForm).toContainText(sermon);
      await expect(recordForm.getByRole("searchbox", { name: "Sermon" })).toHaveCount(0);
      // Escape closes it and hands the keyboard back to where it was.
      await page.keyboard.press("Escape");
      await expect(recordForm).toBeHidden();
      await expect(fromPage).toBeFocused();
      // A second occasion, at the venue already made. The same day twice is two records.
      await fromPage.click();
      await choose("Venue", `${venue} · Springfield`);
      await recordForm.getByRole("button", { name: "Record", exact: true }).click();
      await expect(recordForm).toBeHidden();
      await expect(own).toContainText("Preached 2 times, most recently on");

      // From its card among the sermon ideas, and from the dashboard.
      await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(sermon)}`);
      await page.getByRole("button", { name: `Record preaching of ${sermon}` }).click();
      await expect(recordForm).toContainText(sermon);
      await recordForm.getByRole("button", { name: "Cancel" }).click();
      await expect(recordForm).toBeHidden();
      await expect(page).toHaveURL(/\/library\/sermon-ideas\?/);
      await page.goto("/dashboard");
      await page
        .getByRole("main")
        .getByRole("button", { name: /^Record preaching/ })
        .click();
      await expect(recordForm.getByRole("searchbox", { name: "Sermon" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(recordForm).toBeHidden();
      await expect(page).toHaveURL(/\/dashboard$/);

      // A preached sermon cannot be deleted, and says why.
      await page.goto(sermonAddress);
      await page.getByRole("button", { name: "Delete idea" }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: /^Delete/ })
        .click();
      await expect(
        said("This sermon has been preached, so it cannot be deleted. Archive it instead."),
      ).toBeVisible();
      await expect(page).toHaveURL(sermonAddress);
      await page.reload();
      await expect(own).toContainText("Preached 2 times");

      // Filed as something else, its record is kept and nothing new can be recorded.
      await page.getByRole("radio", { name: "Point" }).check({ force: true });
      await expect(page.getByText("Now filed as: Point idea.")).toBeVisible();
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(said("Changes saved.")).toBeVisible();
      await page.reload();
      await expect(own).toContainText("Preached 2 times");
      await expect(own).toContainText("This idea is not filed as a sermon now");
      await expect(record()).toHaveCount(0);
      await findRecords();
      await expect(rows()).toHaveCount(2);
      await expect(rows().first()).toContainText("Now filed as: Point idea");
      await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(sermon)}`);
      await expect(page.getByRole("link", { name: sermon })).toBeVisible();
      await expect(page.getByRole("button", { name: `Record preaching of ${sermon}` })).toHaveCount(
        0,
      );

      // A sermon again, then archived: out of the ideas, still in the record.
      await page.goto(sermonAddress);
      await page.getByRole("radio", { name: "Sermon" }).check({ force: true });
      await expect(page.getByText("Now filed as: Sermon idea.")).toBeVisible();
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(said("Changes saved.")).toBeVisible();
      await page.getByRole("button", { name: "Archive idea" }).click();
      await page
        .getByRole("alertdialog", { name: "Archive this idea?" })
        .getByRole("button", { name: "Archive" })
        .click();
      await expect(said(/^Archived /)).toBeVisible();
      await findRecords();
      await expect(rows()).toHaveCount(2);
      await expect(rows().first()).toContainText("Archived");
    } finally {
      // Remove what this run made, whatever happened above. The venue and the
      // context are managed from a record that has something in it, so the last
      // occasion lets go of them and stays until they are gone.
      await findRecords();
      const details = page.getByRole("dialog", { name: "Record details" });
      const removeFirst = async (left: number) => {
        await rows().first().getByRole("button").click();
        await details.getByRole("button", { name: "Delete record" }).click();
        await details
          .getByRole("alertdialog")
          .getByRole("button", { name: "Delete record" })
          .click();
        await expect(details).toBeHidden();
        await expect(rows()).toHaveCount(left - 1);
      };
      let left = await rows().count();
      for (; left > 1; left -= 1) await removeFirst(left);
      if (left === 1) {
        await rows().first().getByRole("button").click();
        await details.getByRole("button", { name: "Edit" }).click();
        const editForm = page.getByRole("dialog", { name: "Edit record" });
        await choose("Venue", "None");
        await choose("Context", "None");
        await editForm.getByRole("button", { name: "Save changes" }).click();
        await expect(editForm).toBeHidden();
        // The search was for the venue's and the context's names too; the sermon's still has it.
        await expect(rows()).toHaveCount(1);
        for (const [manage, title, name] of [
          ["Manage venues", "Venues", venue],
          ["Manage contexts", "Contexts", context],
        ]) {
          await page.getByRole("button", { name: manage }).click();
          const dialog = page.getByRole("dialog", { name: title });
          const remove = dialog.getByRole("button", { name: `Delete ${name}` });
          if ((await remove.count()) > 0) {
            await remove.click();
            await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
            await expect(remove).toHaveCount(0);
          }
          await page.keyboard.press("Escape");
          await expect(dialog).toBeHidden();
        }
        await removeFirst(1);
      }
      // With no record left, the idea can go.
      await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(sermon)}&archived=all`);
      const link = page.getByRole("link", { name: sermon });
      if ((await link.count()) > 0) {
        await link.click();
        await page.getByRole("button", { name: "Delete idea" }).click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: /^Delete/ })
          .click();
        await expect(page).toHaveURL(/\/library\/sermon-ideas(\?|$)/);
      }
    }
  });
});
