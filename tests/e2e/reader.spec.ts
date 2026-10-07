// Regression tests for the reader behaviours that broke repeatedly in the
// previous app. They run against the production build on desktop and phone.

import { expect, test, type Page } from '@playwright/test';
import { copySelection, importOldBackup, mockOpenRouter, setOpenRouterKey } from './helpers';

/** The visible mode switch: toolbar on desktop, floating bar on phones. */
const modeButton = (page: Page, label: string) => page.locator('.mode-seg button:visible, .mode-bar button:visible', { hasText: new RegExp(`^${label}$`) }).first();

test.beforeEach(async ({ page }) => {
  await importOldBackup(page);
});

test('old backup imports: texts, translations, calque', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.text-card')).toHaveCount(2);
  await page.locator('.text-card', { hasText: 'Zarathustra' }).locator('.card-main').click();
  await expect(page.locator('.text .w.k', { hasText: /^Volk$/ })).toBeVisible(); // saved word is underlined
  // saved passage is outlined (two shapes when its lines don't overlap horizontally)
  await expect(page.locator('.pl path').first()).toBeVisible();
});

test('drop cap spans exactly its lines and text flows beside it', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 800 });
  await page.goto('/#/read/text-z');
  const g = await page.evaluate(() => {
    const cap = document.querySelector('.cap')!.getBoundingClientRect();
    const p = document.querySelector('.cap')!.closest('.para')!;
    const lh = parseFloat(getComputedStyle(p).lineHeight);
    const chunks = [...p.querySelectorAll('.c')].map((c) => c.getBoundingClientRect());
    const besideCap = chunks.filter((r) => r.top < cap.bottom - 4);
    const below = chunks.filter((r) => r.top >= cap.bottom - 4);
    return { lines: cap.height / lh, besideOk: besideCap.every((r) => r.left >= cap.right - 1), belowStarts: Math.min(...below.map((r) => r.left)), capLeft: cap.left };
  });
  expect(g.lines).toBeCloseTo(3, 1);
  expect(g.besideOk).toBe(true);
  expect(Math.abs(g.belowStarts - g.capLeft)).toBeLessThan(2); // line 4 returns to the margin: no empty rows
});

test('mirror and aligned modes have identical geometry (zero shift)', async ({ page }) => {
  await page.goto('/#/read/text-z');
  const rects = () => page.evaluate(() => [...document.querySelectorAll('.text .c')].map((c) => { const r = c.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top + scrollY)},${Math.round(r.width)}`; }));
  await modeButton(page, 'Mirror').click();
  const mirror = await rects();
  await expect(page.locator('.text .c >> nth=0 >> .m')).toBeVisible();
  await modeButton(page, 'Aligned').click();
  expect(await rects()).toEqual(mirror);
  await expect(page.locator('.cb').first()).toContainText('looked at'); // separable verb badge
});

test('word lookup: streams, saves, underlines; second click reuses it; Back closes', async ({ page }) => {
  const requests = await mockOpenRouter(page);
  await setOpenRouterKey(page);
  await page.goto('/#/read/text-z');
  const word = page.locator('.text .w', { hasText: /^Herzen$/ });
  await expect(word).not.toHaveClass(/\bk\b/);
  await word.click();
  await expect(page.locator('.sheet .md strong')).toHaveText('Answer');
  expect(requests[0].messages.at(-1).content).toBe("Brief etymology of the German word 'Herzen'.");
  await expect(word).toHaveClass(/\bk\b/);
  await page.goBack();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/read\/text-z$/);
  await word.click();
  await expect(page.locator('.sheet .md strong')).toHaveText('Answer');
  expect(requests.length).toBe(1);
});

test('passages: one contiguous outline, line gaps count as inside', async ({ page }) => {
  const requests = await mockOpenRouter(page);
  await setOpenRouterKey(page);
  await page.goto('/#/read/text-z');
  await page.evaluate(() => {
    const p = document.querySelectorAll('.text .para')[2];
    const spans = p.querySelectorAll('[data-o]');
    const r = document.createRange();
    r.setStart(spans[0].firstChild!, 0);
    r.setEnd(spans[spans.length - 1].firstChild!, 1);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await page.locator('.sel-bar >> text=Translate passage').click();
  await expect(page.locator('.sheet .md strong')).toHaveText('Answer');
  expect(requests.at(-1).messages.at(-1).content).toContain('Sie haben etwas, worauf sie stolz sind.');
  await page.keyboard.press('Escape');
  const para = page.locator('.text .para').nth(2);
  await expect(para.locator('.pl path')).toHaveCount(1);
  const gap = await para.evaluate((p) => {
    const r = p.getBoundingClientRect();
    return { x: r.left + r.width / 3, y: r.top + parseFloat(getComputedStyle(p).lineHeight) };
  });
  if (test.info().project.name === 'desktop') {
    await page.mouse.move(gap.x, gap.y);
    await expect(para.locator('.pl path.hot')).toHaveCount(1);
  }
  await page.mouse.click(gap.x, gap.y);
  await expect(page.locator('.sheet-target')).toContainText('Sie haben etwas');
});

test('copy: mirror mode gives spaced words, drop-cap words stay whole', async ({ page }) => {
  await page.goto('/#/read/text-z');
  await page.evaluate(() => {
    const spans = document.querySelectorAll('.text .para [data-o]');
    const r = document.createRange();
    r.setStart(spans[0].firstChild!, 0);
    r.setEnd(spans[3].firstChild!, spans[3].textContent!.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  expect(await copySelection(page)).toBe('Als Zarathustra diese');
  await page.keyboard.press('m');
  await page.evaluate(() => {
    const ms = document.querySelectorAll('.text .para .c > .m');
    const r = document.createRange();
    r.setStart(ms[1].firstChild!, 0);
    r.setEnd(ms[6].lastChild!, ms[6].lastChild!.textContent!.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  expect(await copySelection(page)).toBe('Zarathustra these words spoken had, saw');
});

test('right-to-left text flows right to left with line breaks kept', async ({ page }) => {
  await page.goto('/#/read/text-b');
  const p = page.locator('.text .para').first();
  await expect(p).toHaveAttribute('dir', 'rtl');
  const xs = await p.locator('.w').evaluateAll((ws) => ws.slice(0, 3).map((w) => w.getBoundingClientRect().left));
  expect(xs[0]).toBeGreaterThan(xs[1]);
  expect(xs[1]).toBeGreaterThan(xs[2]);
  await expect(p.locator('br')).toHaveCount(2);
});

test('reading position survives a reload (line precise)', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 400 });
  await page.goto('/#/read/text-z');
  const firstWord = () =>
    page.evaluate(() => {
      const bar = document.querySelector('.reader-bar')!.getBoundingClientRect().bottom;
      return [...document.querySelectorAll('.text .w')].find((w) => w.getBoundingClientRect().top >= bar)?.textContent;
    });
  await page.evaluate(() => scrollTo(0, 420));
  await page.waitForTimeout(1500);
  const before = await firstWord();
  await page.reload();
  await page.waitForSelector('.text .para');
  await page.waitForTimeout(300);
  expect(await firstWord()).toBe(before);
});

test('several lookups run at once; finished ones wait in the dock until seen', async ({ page }) => {
  await mockOpenRouter(page, 700);
  await setOpenRouterKey(page);
  await page.goto('/#/read/text-z');
  await page.locator('.text .w', { hasText: /^Worte$/ }).click();
  await page.keyboard.press('Escape');
  await page.locator('.text .w', { hasText: /^Ohren$/ }).first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.dock-item')).toHaveCount(2);
  await expect(page.locator('.dock-item.done')).toHaveCount(2);
  await page.locator('.dock-item.done .dock-open', { hasText: 'Worte' }).click();
  await expect(page.locator('.sheet-target')).toHaveText('Worte');
  await page.keyboard.press('Escape');
  await expect(page.locator('.dock-item')).toHaveCount(1);
});

test('book-length texts render lazily and still restore the reading position', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop');
  const para = (i: number) => `Absatz ${i}: Also sprach Zarathustra zum Volke und schwieg, denn sie verstanden ihn nicht, und er sah sie lange an.`;
  const content = Array.from({ length: 900 }, (_, i) => para(i)).join('\n\n');
  await page.goto('/#/settings');
  const backup = { version: 2, texts: [{ id: 'book', title: 'Book', language: 'German', content, createdAt: '2026-01-01', updatedAt: '2026-01-01' }], annotations: [] };
  await page.setInputFiles('input[type=file]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.click('.modal-foot >> text=Import');
  await page.goto('/#/read/book');
  await page.waitForSelector('.text .para .w');
  expect(await page.locator('.para.ph').count()).toBeGreaterThan(700); // most of the book is not rendered
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 2500);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(1500);
  const first = () =>
    page.evaluate(() => {
      const bar = document.querySelector('.reader-bar')!.getBoundingClientRect().bottom;
      return [...document.querySelectorAll('.text .w')].find((w) => w.getBoundingClientRect().top >= bar)?.closest('.para')?.textContent?.slice(0, 10);
    });
  const before = await first();
  expect(before).toMatch(/^Absatz \d+/);
  await page.reload();
  await page.waitForSelector('.text .para .w');
  await page.waitForTimeout(400);
  expect(await first()).toBe(before);
});
