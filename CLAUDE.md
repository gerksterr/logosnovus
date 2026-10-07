# Logos Novus — notes for code assistants

Static React + TypeScript app (Vite). No server. Data lives in IndexedDB and
syncs per record to Firestore. Keep files small and focused; read only the
files a change needs (map below).

## Commands

- `npm run typecheck` — must be clean
- `npm test` — vitest unit tests (`src/**/*.test.ts`)
- `npm run e2e` — Playwright against the production build (desktop + phone)
- Run all three before committing.

## Invariants (most past bugs came from breaking one of these)

1. **Offsets, not DOM text.** `text/document.ts` parses a text once into
   paragraphs → chunks (whitespace-delimited; one calque slot each) → words, all
   addressed by offsets into `doc.plain` (markup stripped). Rendering, lookups,
   passages, copy, scroll memory and the minimap all use these offsets. Never
   read words back from the DOM's text.
2. **One DOM for every display mode.** `reader/Paragraph.tsx` renders each chunk
   with an original layer `.o` and a mirror layer `.m`; modes are a class on
   `.text` (`reader.css`). Mirror/aligned stack both layers in one grid cell, so
   switching cannot move anything. Never render modes differently in React.
3. **Calques are stored aligned:** `Calque.slots[i]` belongs to `doc.chunks[i]`;
   `sig` fingerprints the source. Raw LLM output goes through
   `calque/align.ts` (DP alignment) once, when it arrives.
4. **Every persisted record** has `id`, `updatedAt` (ms) and optional `deleted`
   (tombstone). Mutate only through `data/store.ts` (`put`, `patch`, `remove`,
   `merge`) so IndexedDB, sync and UI stay consistent. Never use localStorage for
   data (only for small per-device settings).
5. Forms with typed input never close on a backdrop click (`Modal dismissable`
   stays false); every overlay uses `useBackClose` so Android Back closes it.

## Map: feature → files

| Feature | Files |
| --- | --- |
| Markup `[Red]` `[hang:n]` | `text/markup.ts` |
| Text model, word/passage keys | `text/document.ts` |
| Calque notation `word[1:meaning]` | `calque/notation.ts` |
| Calque alignment | `calque/align.ts` (tests: `calque/calque.test.ts`) |
| Separable verbs / composites | `calque/composites.ts` |
| Record types | `model/types.ts`; seeds in `model/defaults.ts` |
| Store, persistence | `data/store.ts`, `data/db.ts`, `data/merge.ts` |
| Derived lookups (versions, prompts, docs) | `data/selectors.ts` |
| Old-app import | `data/legacy.ts` |
| Share links | `data/share.ts` |
| LLM providers / request templates | `llm/providers.ts`, `llm/request.ts` |
| Streaming parsers | `llm/stream.ts` |
| Running requests, dock state, saving results | `llm/queries.ts`, `llm/run.ts` |
| Reader view, toolbar, modes, selection bar | `reader/ReaderView.tsx` |
| Text rendering | `reader/TextBody.tsx`, `reader/Paragraph.tsx`, `styles/reader.css` |
| Long texts (lazy paragraphs) | `reader/lazy.ts` |
| Passage outlines + hit testing | `reader/geometry.ts`, `reader/PassageLayer.tsx` |
| Selection, copy | `reader/dom.ts` |
| Scroll memory | `reader/scroll.ts` |
| Context menu actions | `reader/menu.ts` |
| Minimap, notes, calque panel, display options | `reader/Minimap.tsx`, `reader/NotesDrawer.tsx`, `reader/CalquePanel.tsx`, `reader/ReaderOptions.tsx` |
| Translation sheet, chat, dictionary, dock | `sheet/*.tsx`; entry point `sheet/open.ts` |
| Library, editor, playground, ordering | `library/*` |
| Prompts, models, languages, endpoints | `prompts/PromptsView.tsx` |
| Settings, keys, backup, sync UI | `settings/SettingsView.tsx` |
| Cloud sync | `sync/cloud.ts` (tests with a fake Firestore: `sync/cloud.test.ts`) |
| Routing, Back button, device settings, toasts/dialogs | `app/router.ts`, `app/settings.ts`, `app/ui.ts` |
| Shared UI (modal, drawer, menu, markdown, model switch) | `ui/*` |

## Style

- Plain CSS with semantic classes in `src/styles/` (`base` tokens/themes, `app`,
  `reader`, `panels`). Themes only swap CSS variables.
- Comments explain why, briefly. Tests sit next to the code they test.
