import type { Page, Route } from '@playwright/test';

// A backup in the previous app's format (public-domain texts: Nietzsche, Mishnah Berakhot).
export const ZARATHUSTRA =
  '[hang:3][Red]A[/Red][/hang]ls Zarathustra diese Worte gesprochen hatte, sahe er wieder das Volk an und schwieg. „Da stehen sie“, sprach er zu seinem Herzen, „da lachen sie: sie verstehen mich nicht, ich bin nicht der Mund für diese Ohren.\n\n' +
  'Muss man ihnen erst die Ohren zerschlagen, dass sie lernen, mit den Augen hören? Muss man rasseln gleich Pauken und Busspredigern? Oder glauben sie nur dem Stammelnden?\n\n' +
  'Sie haben etwas, worauf sie stolz sind. Wie nennen sie es doch, was sie stolz macht? Bildung nennen sie’s, es zeichnet sie aus vor den Ziegenhirten.';
export const ZARATHUSTRA_CALQUE =
  '[hang:3][Red]A[/Red][/hang]s Zarathustra these words spoken had, saw[1:looked-at] he again the folk at[1] and was-silent. "There stand they", spoke he to his heart, "there laugh they: they understand me not, I am not the mouth for these ears.\n\n' +
  'Must one them first the ears smash, that they learn, with the eyes to-hear? Must one rattle like kettledrums and penitence-preachers? Or believe they only the stammering-one?\n\n' +
  'They have something, whereof they proud are. How call they it then, what them proud makes? Education call they-it, it draws[1:distinguishes] them out[1] before the goat-herds.';
export const BERAKHOT = 'מֵאֵימָתַי קוֹרִין אֶת שְׁמַע בָּעֲרָבִין?\nמִשָּׁעָה שֶׁהַכֹּהֲנִים נִכְנָסִים לֶאֱכוֹל בִּתְרוּמָתָן.\nעַד סוֹף הָאַשְׁמוּרָה הָרִאשׁוֹנָה.';

export const OLD_BACKUP = {
  version: 2,
  texts: [
    { id: 'text-z', title: 'Zarathustra Vorrede 5', language: 'German', content: ZARATHUSTRA, wordBlueprintId: 'bp-w', passageBlueprintId: 'bp-p', createdAt: '2026-08-25T10:00:00.000Z', updatedAt: '2026-08-25T10:00:00.000Z' },
    { id: 'text-b', title: 'Berakhot 2a', language: 'Hebrew', content: BERAKHOT, wordBlueprintId: '', passageBlueprintId: '', createdAt: '2026-08-26T10:00:00.000Z', updatedAt: '2026-08-26T10:00:00.000Z' },
  ],
  blueprints: [
    { id: 'bp-w', name: 'Nietzsche word', type: 'word', template: "Brief etymology of the German word '{word}'.", language: 'all', createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z' },
    { id: 'bp-p', name: 'Nietzsche passage', type: 'passage', template: "Symbolic renderings of '{text}'.", language: 'all', createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z' },
  ],
  languages: [
    { id: 'lang-german', name: 'German', code: 'de', isRTL: false },
    { id: 'lang-hebrew', name: 'Hebrew', code: 'he', isRTL: true },
  ],
  llmModelBlueprints: [{ id: 'model-or', name: 'opus', provider: 'openrouter', modelName: 'anthropic/claude-opus-5.5', isDefault: true, createdAt: '2026-10-01', updatedAt: '2026-10-01' }],
  annotations: [
    { id: 'ann-1', textId: 'text-z', type: 'word', target: 'Volk', result: '**Volk**: the people.', queryUsed: 'q', blueprintName: 'Nietzsche word', createdAt: '2026-09-01T00:00:00.000Z', modelUsed: 'm' },
    { id: 'ann-2', textId: 'text-z', type: 'passage', target: 'Muss man rasseln gleich Pauken und Busspredigern?', result: 'Must one rattle…', queryUsed: 'q', blueprintName: 'Nietzsche passage', createdAt: '2026-09-02T00:00:00.000Z' },
  ],
  mirrorTranslations: { 'text-z': { textId: 'text-z', rawCalqueText: ZARATHUSTRA_CALQUE, sourceModel: 'test', updatedAt: '2026-09-05T00:00:00.000Z' } },
  calqueHistory: [],
  decipherChats: {},
};

export async function importOldBackup(page: Page) {
  await page.goto('/#/settings');
  await page.setInputFiles('input[type=file]', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(OLD_BACKUP)) });
  await page.click('.modal-foot >> text=Import');
  await page.waitForSelector('.modal', { state: 'detached' });
}

export async function setOpenRouterKey(page: Page) {
  await page.goto('/#/settings');
  const input = page.locator('.key-row').first().locator('input');
  await input.fill('sk-or-v1-test');
  await input.press('Enter');
}

/** Fake OpenRouter: streams a short markdown answer and records requests. */
export async function mockOpenRouter(page: Page, delay = 200) {
  const requests: any[] = [];
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route: Route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    requests.push(body);
    await new Promise((r) => setTimeout(r, delay));
    const events = [
      { model: 'anthropic/claude-opus-5.5', choices: [{ delta: { reasoning: 'thinking ' } }] },
      { choices: [{ delta: { content: '**Answer** ' } }] },
      { choices: [{ delta: { content: 'with details.' }, finish_reason: 'stop' }] },
    ];
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n',
    });
  });
  return requests;
}

/** Text a copy of the current selection would put on the clipboard. */
export function copySelection(page: Page) {
  return page.evaluate(() => {
    let got: string | null = null;
    const grab = (e: ClipboardEvent) => (got = e.clipboardData!.getData('text/plain'));
    document.addEventListener('copy', grab);
    document.execCommand('copy');
    document.removeEventListener('copy', grab);
    return got;
  });
}
