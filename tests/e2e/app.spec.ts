import { expect, test } from '@playwright/test';
import { importOldBackup, mockOpenRouter, setOpenRouterKey, ZARATHUSTRA_CALQUE } from './helpers';

test.beforeEach(async ({ page }) => {
  await importOldBackup(page);
});

test('calque: generate with an edited request, then read it in mirror mode', async ({ page }) => {
  const requests: any[] = [];
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    requests.push(JSON.parse(route.request().postData() || '{}'));
    const body = ZARATHUSTRA_CALQUE.replace('Education', 'Culture');
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ choices: [{ delta: { content: body } }] })}\n\ndata: [DONE]\n\n` });
  });
  await setOpenRouterKey(page);
  await page.goto('/#/read/text-z');
  await page.locator('[title^="Calque"]').click();
  await page.locator('.modal .tabs >> text=Generate').click();
  await page.locator('.modal input[type=number]').fill('2000');
  await page.locator('.modal details.raw summary').click();
  await expect(page.locator('.modal details.raw textarea')).toHaveValue(/"max_tokens": 2000/);
  await page.locator('.modal >> text=Generate calque').click();
  await expect(page.locator('.modal .tabs button.on')).toHaveText('Alignment');
  expect(requests[0].max_tokens).toBe(2000);
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await expect(page.locator('.text .c .m', { hasText: /^Culture$/ })).toBeVisible();
});

test('chat about a saved translation is stored on that version', async ({ page }) => {
  const requests = await mockOpenRouter(page);
  await setOpenRouterKey(page);
  await page.goto('/#/read/text-z');
  await page.locator('.text .w', { hasText: /^Volk$/ }).click();
  await expect(page.locator('.sheet .md strong')).toHaveText('Volk');
  await page.locator('.chat textarea').fill('And in Luther?');
  await page.locator('.chat [title="Send"]').click();
  await expect(page.locator('.chat .msg.assistant .md strong')).toHaveText('Answer');
  const sent = requests[0].messages.map((m: any) => m.role);
  expect(sent).toEqual(['user', 'assistant', 'user']);
  await page.reload();
  await page.locator('.text .w', { hasText: /^Volk$/ }).click();
  await expect(page.locator('.chat .msg.user')).toHaveText('And in Luther?');
});

test('copy & paste models: per-text web assist, prompt to clipboard, pasted answer is saved', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#/read/text-z');
  await page.locator('.lookup-row.word .lr-web').click(); // words of this text go through a chat site
  await expect(page.locator('.lookup-row.word .mp-trigger')).toContainText('Claude.ai');
  await page.locator('.text .w', { hasText: /^Herzen$/ }).click();
  await expect(page.locator('.web-assist')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("'Herzen'");
  await page.locator('.web-assist textarea').fill('**Herz**: heart.');
  await page.locator('.web-assist >> text=Save translation').click();
  await expect(page.locator('.sheet .md strong')).toHaveText('Herz');
  await expect(page.locator('.text .w', { hasText: /^Herzen$/ })).toHaveClass(/\bk\b/);
});

test('model picker: readable list, switches the active model', async ({ page }) => {
  await page.goto('/#/read/text-z');
  const trigger = test.info().project.name === 'phone' ? page.locator('.lookup-row.passage .mp-trigger') : page.locator('.reader-bar .mp-trigger');
  await trigger.click();
  const pop = page.locator('.mp-pop');
  await expect(pop.locator('.mp-group')).toHaveText([/API/, /Copy & paste/]);
  await expect(pop.locator('.mp-row', { hasText: 'Claude.ai' })).not.toContainText('copy & paste'); // no duplicated suffix
  const colors = await pop.locator('.mp-row-name').first().evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el.closest('.mp-pop')!).backgroundColor]);
  expect(colors[0]).not.toEqual(colors[1]);
  await pop.locator('.mp-row', { hasText: 'ChatGPT' }).click();
  await expect(pop).toHaveCount(0);
  await expect(trigger).toContainText('ChatGPT');
});

test('share link round trip merges into another browser', async ({ page, browser }) => {
  await page.goto('/#/');
  await page.evaluate(() => {
    (window as any).__copied = '';
    navigator.clipboard.writeText = async (t: string) => void ((window as any).__copied = t);
  });
  await page.locator('.text-card', { hasText: 'Berakhot' }).locator('[aria-label="Copy share link"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__copied)).toContain('#share=');
  const url: string = await page.evaluate(() => (window as any).__copied);
  const { viewport, isMobile, hasTouch, baseURL } = test.info().project.use;
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch });
  const other = await ctx.newPage();
  await other.goto(url.replace(/^https?:\/\/[^/]+/, baseURL!));
  await other.locator('.modal-foot >> text=Add').click();
  await expect(other.locator('.text-card', { hasText: 'Berakhot' })).toBeVisible();
  await ctx.close();
});

test('custom library order: drag a text to the top', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'pointer drag is exercised on desktop');
  await page.goto('/#/');
  await page.locator('.filters select').selectOption('custom');
  const titles = () => page.locator('.card-title').allInnerTexts();
  expect(await titles()).toEqual(['Berakhot 2a', 'Zarathustra Vorrede 5']);
  const handle = page.locator('.drag-handle').nth(1);
  const box = (await handle.boundingBox())!;
  const top = (await page.locator('.text-card').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(top.x + 10, top.y + 10, { steps: 8 }); // cards sit side by side: drop on the first one's leading half
  await page.mouse.up();
  expect(await titles()).toEqual(['Zarathustra Vorrede 5', 'Berakhot 2a']);
  await page.reload();
  expect(await titles()).toEqual(['Zarathustra Vorrede 5', 'Berakhot 2a']);
});

test('works offline once loaded (service worker)', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'desktop');
  await page.goto('/#/read/text-z');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.text .w', { hasText: /^Volk$/ })).toBeVisible();
  await context.setOffline(false);
});

test('library: search inside texts, language filter, continue reading', async ({ page }) => {
  await page.goto('/#/');
  await page.locator('.filters .search input').fill('Ziegenhirten');
  await expect(page.locator('.text-card')).toHaveCount(1);
  await expect(page.locator('.card-title')).toHaveText('Zarathustra Vorrede 5');
  await page.locator('.filters .search input').fill('');
  await page.locator('.filters .chip', { hasText: 'Hebrew' }).click();
  await expect(page.locator('.card-title')).toHaveText(['Berakhot 2a']);
  // read a little, come back: the text is offered to continue
  await page.setViewportSize({ width: 600, height: 400 });
  await page.goto('/#/read/text-z');
  await page.evaluate(() => scrollTo(0, 700));
  await page.waitForTimeout(1500);
  await page.goto('/#/');
  await expect(page.locator('.cont-card')).toContainText('Zarathustra Vorrede 5');
  await page.locator('.cont-card').click();
  await expect(page).toHaveURL(/#\/read\/text-z$/);
});

test('lexicon: words with calque meaning and gloss; a context line opens the text at that word', async ({ page }) => {
  await page.goto('/#/lexicon');
  const item = page.locator('.lex-item', { hasText: 'Volk' });
  await expect(item.locator('.lex-calque')).toHaveText('folk');
  await expect(item.locator('.lex-gloss')).toContainText('the people.');
  await item.locator('.lex-row').click();
  await expect(item.locator('.kwic-row')).toHaveCount(1);
  await item.locator('.kwic-row').click();
  await expect(page).toHaveURL(/#\/read\/text-z\/\d+$/);
  await expect(page.locator('.text .w.sel')).toHaveText('Volk');
  await expect(page.locator('.text .w.sel')).toBeInViewport();
});

test('sheet: instant calque gloss, several models at once, compare versions', async ({ page }) => {
  const requests = await mockOpenRouter(page, 300);
  await setOpenRouterKey(page);
  await page.goto('/#/read/text-z');
  await page.locator('.text .w', { hasText: /^Volk$/ }).click();
  await expect(page.locator('.sheet .sh-gloss')).toHaveText('folk'); // from the calque, no request
  expect(requests).toHaveLength(0);
  await page.locator('.sheet .sh-actions >> text=Several models').click();
  const boxes = page.locator('.sheet .many-row input:not([disabled])');
  const n = await boxes.count();
  expect(n).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  await page.locator('.sheet .composer .btn.primary').click();
  await expect(page.locator('.sheet .vchip.live').first()).toBeVisible();
  await expect(page.locator('.sheet .vchip:not(.live)')).toHaveCount(n + 1);
  expect(requests).toHaveLength(n);
  if (test.info().project.name === 'desktop') {
    await page.locator('.sheet .sh-actions >> text=Compare').click();
    await expect(page.locator('.sheet .compare-col')).toHaveCount(2);
    await expect(page.locator('.sheet.wide')).toBeVisible();
  }
});
