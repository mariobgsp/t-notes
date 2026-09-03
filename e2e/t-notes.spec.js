const { test, expect } = require("playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("notes: add, tag filter, persist", async ({ page }) => {
  await page.locator("#note-input").fill("Buy milk #home");
  await page.locator("#note-form button").click();
  const note = page.locator("#notes .note").first();
  await expect(note).toContainText("Buy milk");
  await note.locator(".chip").click(); // filter by #home
  await expect(page.locator("#notes .note")).toHaveCount(1);
  await page.locator("#filters .fbtn").click(); // clear
  await page.reload();
  await expect(page.locator("#notes .note").first()).toContainText("Buy milk");
});

test("board: card lifecycle with modal", async ({ page }) => {
  await page.locator("#tab-board").click();
  await page.locator("#card-input").fill("Ship v1 #work");
  await page.locator("#card-form button").click();
  const card = page.locator("#c-todo .card").first();
  await expect(card).toContainText("Ship v1");
  // move to Doing, check done
  await card.locator(".mv", { hasText: "→" }).click();
  await expect(page.locator("#c-doing .card").first()).toContainText("Ship v1");
  // modal: desc + checklist + due + label + comment
  await page
    .locator("#c-doing .card")
    .first()
    .locator('[data-act="open"]')
    .click();
  const m = page.locator("#modal-body");
  await m.locator("textarea").fill("Release notes here");
  await m.getByPlaceholder(/Add checklist item/).fill("Write changelog");
  await m.getByPlaceholder(/Add checklist item/).press("Enter");
  await m.getByPlaceholder(/Add checklist item/).fill("Tag release");
  await m.getByPlaceholder(/Add checklist item/).press("Enter");
  await expect(m.locator(".clist .mrow")).toHaveCount(2);
  await m.locator('.clist .mrow input[type="checkbox"]').first().check();
  await m.locator('input[type="date"]').fill("2030-01-15");
  await m.locator('[data-act="label"]').click();
  await m.locator('.pal [data-c="green"]').click();
  await m.getByPlaceholder(/Write a comment/).fill("Looks good");
  await m.getByPlaceholder(/Write a comment/).press("Enter");
  await m.locator("text=close").click();
  const done = page.locator("#c-doing .card").first();
  await expect(done).toContainText("1/2");
  await expect(done).toContainText("2030-01-15");
  await expect(done).toContainText("💬1");
  // persists
  await page.reload();
  await page.locator("#tab-board").click();
  await expect(page.locator("#c-doing .card").first()).toContainText("Ship v1");
});

test("guide dialog opens and closes", async ({ page }) => {
  await page.locator("#guide").click();
  await expect(page.locator("#guide-modal")).toContainText("t-notes guide");
  await page.locator("#guide-close").click();
  await expect(page.locator("#guide-modal")).toBeHidden();
});

test("search, lists, theme", async ({ page }) => {
  await page.locator("#tab-board").click();
  await page.locator("#card-input").fill("Alpha task");
  await page.locator("#card-form button").click();
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
