const { test, expect } = require("playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function addNote(page, title, body = "") {
  await page.locator("#new-note").click();
  await page.locator("#compose-title").fill(title);
  if (body) await page.locator("#compose-text").fill(body);
  await page.locator("#compose-save").click();
}

async function addCard(page, title, body = "") {
  await page.locator("#tab-board").click();
  await page.locator("#new-card").click();
  await page.locator("#compose-title").fill(title);
  if (body) await page.locator("#compose-text").fill(body);
  await page.locator("#compose-save").click();
}

test("notes: popup, title-first, toast, persist", async ({ page }) => {
  await addNote(page, "Shopping", "Buy milk #home");
  const note = page.locator("#notes .note").first();
  await expect(note.locator(".ntitle")).toContainText("Shopping");
  await expect(note.locator(".nbody")).toContainText("Buy milk");
  await expect(page.locator("#toasts .toast").first()).toContainText(
    "Note saved",
  );
  await page.reload();
  await expect(page.locator("#notes .note").first()).toContainText("Shopping");
});

test("rich text: bold survives save", async ({ page }) => {
  await page.locator("#new-note").click();
  await page.locator("#compose-title").fill("Styled");
  await page.locator("#compose-text").fill("make this bold");
  await page.locator("#compose-text").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.locator('#compose-tools [data-cmd="bold"]').click();
  await page.locator("#compose-save").click();
  const body = page.locator("#notes .note .nbody").first();
  await expect(body.locator("b, strong").first()).toContainText(
    "make this bold",
  );
});

test("notes: label strips work", async ({ page }) => {
  await addNote(page, "Colored");
  const note = page.locator("#notes .note").first();
  await note.locator('[data-act="label"]').click();
  await note.locator('.pal [data-c="green"]').click();
  await expect(note.locator(".strip").first()).toBeVisible();
});

test("notes: click opens detail with checklist parity", async ({ page }) => {
  await addNote(page, "Pack", "Trip stuff");
  await page.locator("#notes .note .ntitle").first().click();
  const m = page.locator("#modal-body");
  await expect(m.locator(".rich")).toContainText("Trip stuff");
  await m.getByPlaceholder(/Add checklist item/).fill("Passport");
  await m.getByPlaceholder(/Add checklist item/).press("Enter");
  await m.getByPlaceholder(/Add checklist item/).fill("Tickets");
  await m.getByPlaceholder(/Add checklist item/).press("Enter");
  await expect(m.locator(".clist .mrow")).toHaveCount(2);
  await m.locator('.clist .mrow input[type="checkbox"]').first().check();
  await m.locator("text=close").click();
  const note = page.locator("#notes .note").first();
  await expect(note).toContainText("Pack");
  await page.reload();
  await page.locator("#notes .note .ntitle").first().click();
  await expect(page.locator("#modal-body .clist .mrow")).toHaveCount(2);
  await expect(
    page.locator("#modal-body .clist .mrow input").first(),
  ).toBeChecked();
});

test("notes: edit popup prefills and updates", async ({ page }) => {
  await addNote(page, "Draft", "v1 body");
  const note = page.locator("#notes .note").first();
  await note.locator("[data-edit]").click();
  await expect(page.locator("#compose-h")).toHaveText("Edit note");
  await expect(page.locator("#compose-title")).toHaveValue("Draft");
  await expect(page.locator("#compose-text")).toContainText("v1 body");
  await page.locator("#compose-title").fill("Draft v2");
  await page.locator("#compose-text").fill("v2 body");
  await page.locator("#compose-save").click();
  const updated = page.locator("#notes .note").first();
  await expect(updated).toContainText("Draft v2");
  await expect(updated.locator(".nbody")).toContainText("v2 body");
  await page.reload();
  await expect(page.locator("#notes .note").first()).toContainText("Draft v2");
});

test("board: card lifecycle with modal", async ({ page }) => {
  await addCard(page, "Ship v1 #work");
  const card = page.locator("#c-todo .card").first();
  await expect(card).toContainText("Ship v1");
  await card.locator('.mv[data-dir="1"]').click();
  await expect(page.locator("#c-doing .card").first()).toContainText("Ship v1");
  await page
    .locator("#c-doing .card")
    .first()
    .locator('[data-act="open"]')
    .click();
  const m = page.locator("#modal-body");
  await m.locator(".rich").fill("Release notes here");
  await m.getByPlaceholder(/Add checklist item/).fill("Write changelog");
  await m.getByPlaceholder(/Add checklist item/).press("Enter");
  await m.getByPlaceholder(/Add checklist item/).fill("Tag release");
  await m.getByPlaceholder(/Add checklist item/).press("Enter");
  await expect(m.locator(".clist .mrow")).toHaveCount(2);
  await m.locator('.clist .mrow input[type="checkbox"]').first().check();
  await m.locator('input[type="date"]').fill("2030-01-15");
  await m.locator('[data-act="label"]').click();
  await m.locator('.pal [data-c="green"]').click();
  await expect(page.locator("#c-doing .card .strip").first()).toBeVisible();
  await m.getByPlaceholder(/Write a comment/).fill("Looks good");
  await m.getByPlaceholder(/Write a comment/).press("Enter");
  await m.locator("text=close").click();
  const done = page.locator("#c-doing .card").first();
  await expect(done).toContainText("1/2");
  await expect(done).toContainText("2030-01-15");
  await expect(done.locator(".badge", { hasText: "1" }).last()).toBeVisible();
  await page.reload();
  await page.locator("#tab-board").click();
  await expect(page.locator("#c-doing .card").first()).toContainText("Ship v1");
});

test("import/export roundtrip", async ({ page }) => {
  await addNote(page, "Keep me");
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export").click(),
  ]);
  const fp = "/tmp/t-notes-backup-test.json";
  await dl.saveAs(fp);
  await expect(
    page.locator("#toasts .toast", { hasText: "Backup exported" }),
  ).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#notes .note")).toHaveCount(0);
  await page.locator("#import-file").setInputFiles(fp);
  await expect(page.locator("#notes .note").first()).toContainText("Keep me");
  await expect(
    page.locator("#toasts .toast", { hasText: "Imported" }),
  ).toBeVisible();
});

test("guide dialog opens and closes", async ({ page }) => {
  await page.locator("#guide").click();
  await expect(page.locator("#guide-modal")).toContainText("t-notes guide");
  await page.locator("#guide-close").click();
  await expect(page.locator("#guide-modal")).toBeHidden();
});

test("search, lists, theme", async ({ page }) => {
  await page.locator("#tab-board").click();
  await addCard(page, "Alpha task");
  await page.locator("#list-input").fill("Review");
  await page.locator("#list-form button").click();
  await expect(
    page.locator(".colhead h2", { hasText: "Review" }),
  ).toBeVisible();
  await page.locator("#search-input").fill("alpha");
  await expect(page.locator("#c-todo .card")).toHaveCount(1);
  await page.locator("#search-input").fill("zzz-no-match");
  await expect(page.locator("#c-todo .card")).toHaveCount(0);
  await page.locator("#theme").click();
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.dataset.theme),
    )
    .toBe("dark");
  await page.reload();
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.dataset.theme),
    )
    .toBe("dark");
});

async function seedAi(page, reply) {
  await page.evaluate(() =>
    localStorage.setItem(
      "t-notes-v1",
      JSON.stringify({
        notes: [],
        lists: [
          { id: "todo", name: "To Do" },
          { id: "doing", name: "Doing" },
          { id: "done", name: "Done" },
        ],
        cards: [],
        activity: [],
        settings: {
          provider: "zen",
          baseUrl: "https://opencode.ai/zen/v1",
          model: "big-pickle",
          key: "test-key",
        },
      }),
    ),
  );
  await page.route("**/chat/completions", (r) =>
    r.fulfill({ json: { choices: [{ message: { content: reply } }] } }),
  );
  await page.reload();
}

test("ai: summarize replaces compose body", async ({ page }) => {
  await seedAi(page, "Short summary.");
  await page.locator("#new-note").click();
  await page.locator("#compose-title").fill("Long note");
  await page.locator("#compose-text").fill("A very long rambling note body.");
  await page.locator('#compose-ai button:has-text("Summarize")').click();
  await expect(
    page.locator("#toasts .toast", { hasText: "Summarized" }),
  ).toBeVisible();
  await page.locator("#compose-save").click();
  await expect(page.locator("#notes .note .nbody").first()).toContainText(
    "Short summary.",
  );
});

test("ai: checklist adds card items", async ({ page }) => {
  await seedAi(page, "Buy milk\nCall mom");
  await page.locator("#tab-board").click();
  await addCard(page, "Errands");
  await page
    .locator("#c-todo .card")
    .first()
    .locator('[data-act="open"]')
    .click();
  const m = page.locator("#modal-body");
  await m.locator('.mrow button:has-text("Checklist")').click();
  await expect(m.locator(".clist .mrow")).toHaveCount(2);
});

test("ai: missing key opens settings", async ({ page }) => {
  await page.locator("#new-note").click();
  await page.locator("#compose-title").fill("No key note");
  await page.locator('#compose-ai button:has-text("Summarize")').click();
  await expect(page.locator("#settings")).toContainText("AI settings");
});
