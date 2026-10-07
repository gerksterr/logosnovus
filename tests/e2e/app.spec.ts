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

test('copy & paste models: prompt to clipboard, pasted answer is saved', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#/read/text-z');
  await page.locator('.reader-bar select').selectOption({ label: 'Claude.ai (copy & paste) (copy & paste)' });
  await page.locator('.text .w', { hasText: /^Herzen$/ }).click();
  await expect(page.locator('.web-assist')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("'Herzen'");
  await page.locator('.web-assist textarea').fill('**Herz**: heart.');
  await page.locator('.web-assist >> text=Save translation').click();
  await expect(page.locator('.sheet .md strong')).toHaveText('Herz');
  await expect(page.locator('.text .w', { hasText: /^Herzen$/ })).toHaveClass(/\bk\b/);
});

test('share link round trip merges into another browser', async ({ page, browser }) => {
  await page.goto('/#/');
  await page.locator('.text-card', { hasText: 'Berakhot' }).locator('[aria-label="Text actions"]').click();
  await page.evaluate(() => {
    (window as any).__copied = '';
    navigator.clipboard.writeText = async (t: string) => void ((window as any).__copied = t);
  });
  await page.locator('.menu >> text=Copy share link').click();
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
  await page.locator('select').selectOption('custom');
  const titles = () => page.locator('.card-title').allInnerTexts();
  expect(await titles()).toEqual(['Berakhot 2a', 'Zarathustra Vorrede 5']);
  const handle = page.locator('.drag-handle').nth(1);
  const box = (await handle.boundingBox())!;
  const top = (await page.locator('.text-card').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, top.y + 5, { steps: 8 });
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
