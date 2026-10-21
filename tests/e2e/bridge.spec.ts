// The Claude bridge round trip with the real bridge page (bridge/claude-bridge.html)
// served at a stand-in address and a stand-in for claude.ai's `sample`:
// requests are batched onto the clipboard, the bridge answers them, the
// answers come back by clipboard — also after the app was reloaded.

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { importOldBackup } from './helpers';

const BRIDGE = 'https://bridge.test/';
const bridgeHtml = () =>
  '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}</style>' +
  // stand-in for the viewer runtime: answers echo the request and the tier
  `<script>window.claude={use:async(n)=>n==="sample"?async(input,o)=>{const q=Array.isArray(input)?input.at(-1).content:input;const t="Stand-in "+o.modelTier+" answer to: "+q.slice(-60);o.onText&&o.onText({text:t,delta:t});return{text:t,truncated:false,modelTierApplied:o.modelTier}}:null};</script>` +
  `</head><body>${readFileSync('bridge/claude-bridge.html', 'utf8')}</body></html>`;

test.skip(({ browserName }) => browserName !== 'chromium', 'clipboard permissions');

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.route(BRIDGE, (r) => r.fulfill({ contentType: 'text/html', body: bridgeHtml() }));
  await importOldBackup(page);
  await page.goto('/#/settings');
  await page.locator('input[aria-label="Claude bridge address"]').fill(BRIDGE);
  await page.locator('input[aria-label="Claude bridge address"]').blur();
});

async function useClaudeForWords(page: Page) {
  await page.goto('/#/read/text-z');
  await page.locator('.lookup-row.word .mp-trigger').click();
  await page.locator('.mp-row', { has: page.locator('.mp-row-name', { hasText: /^Claude$/ }) }).click();
}

/** Plays the person in the bridge tab: paste the requests, copy the answers. */
async function answerInBridge(context: BrowserContext, ticket: string) {
  const bridge = await context.newPage();
  await bridge.goto(BRIDGE);
  await bridge.locator('#paste').fill(ticket);
  await expect(bridge.locator('#progress')).toHaveText(/(\d+) of \1 answered/);
  await bridge.locator('#copy').click();
  await expect(bridge.locator('#copied')).toContainText('copied');
  await bridge.close();
}

test('words asked through Claude wait in one batch and come back together', async ({ page, context }) => {
  await useClaudeForWords(page);
  await page.locator('.text .w', { hasText: /^Herzen$/ }).click();
  await expect(page.locator('.sheet .bridge-steps')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.text .w', { hasText: /^Ohren$/ }).first().click();
  await expect(page.locator('.bridge-bar')).toContainText('2 waiting');
  const ticket = await page.evaluate(() => navigator.clipboard.readText());
  expect(ticket).toContain('⟦LN-JOBS⟧');
  expect(ticket).toContain("'Herzen'");
  expect(ticket).toContain("'Ohren'");

  await answerInBridge(context, ticket);
  await page.bringToFront();
  await page.locator('.sheet .bridge-steps').getByRole('button', { name: 'Paste answers' }).click(); // the open sheet shows the steps too
  await expect(page.locator('.bridge-bar')).toHaveCount(0);
  await expect(page.locator('.sheet .md')).toContainText("Stand-in default answer to: Brief etymology of the German word 'Ohren'.");
  await expect(page.locator('.sheet .sh-meta')).toContainText('Claude default (claude.ai)');
  await expect(page.locator('.text .w', { hasText: /^Herzen$/ })).toHaveClass(/\bk\b/);
});

test('answers still land after the app was reloaded', async ({ page, context }) => {
  await useClaudeForWords(page);
  await page.locator('.text .w', { hasText: /^Herzen$/ }).click();
  await expect(page.locator('.sheet .bridge-steps')).toBeVisible();
  const ticket = await page.evaluate(() => navigator.clipboard.readText());
  await page.reload();
  await expect(page.locator('.bridge-bar')).toContainText('1 waiting');

  await answerInBridge(context, ticket);
  await page.bringToFront();
  const answers = await page.evaluate(() => navigator.clipboard.readText());
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, answers); // Ctrl+V anywhere
  await expect(page.locator('.bridge-bar')).toHaveCount(0);
  await expect(page.locator('.text .w', { hasText: /^Herzen$/ })).toHaveClass(/\bk\b/);
  await page.locator('.text .w', { hasText: /^Herzen$/ }).click();
  await expect(page.locator('.sheet .md')).toContainText('Stand-in default answer to:');
});
