# Logos Novus

A reading room for foreign, symbolic texts (Jung's *Liber Novus*, Nietzsche, the
New Testament, the Talmud…). Paste a text, tap a word or select a passage, and an
LLM of your choice explains it with your own prompts. Everything you look up is
kept, versioned and shown in the text. A word-for-word **calque** (mirror
translation) can be laid over the original and switched with one key.

It is a static, offline-first web app: it installs on Android and desktop, works
without a connection (except for new AI requests), and syncs across devices with
your Google account.

## Moving over from “Symbolic Text Decipher”

Either:

- **From a backup file:** in the old app use *Export JSON*, then here open
  *Settings → Import backup*. Old backups (and old chat exports) are recognized.
- **From the old cloud save:** *Settings → Sign in with Google → Import from
  previous version's cloud save*.

What happens on import: texts, prompts (your own and the built-in ones you edited
or use), models, all translations with their chats, every calque version (re-aligned
with the new aligner), and “keep original” words come across. API keys are only
imported if you tick the box. Passages are re-anchored in their texts; passages
whose text was edited afterwards are kept and listed as “not found in text”.

## Using it

| Do this | to |
| --- | --- |
| Tap a word | open its saved translations, or ask the active model |
| Select a passage → *Translate passage* | ask about a passage (exact re-selections open the saved one) |
| Tap inside a framed passage (also between its lines) | open that passage |
| Right-click (desktop) / *More* (phone) | dictionary, speak, web chat, keep-original, replace mirror text |
| `M` / `O` / `I` or the mode bar | mirror ⇄ aligned original, original, interlinear |
| Layers icon | generate, paste, version and fix calques |
| Notebook icon | every translation in this text |

Text markup: `[Red]D[/Red]ie`, `[Blue]…[/Blue]`, `[hang:3][Red]D[/Red][/hang]ie`
(a drop cap over 3 lines). Other brackets (`[RP: …]`, `[1]`) are shown dimmed.

Prompt placeholders: `{word}` / `{text}`, `{sentence}` (the sentence around a
word), `{language}`, `{title}`, `{author}` — one prompt can serve several books.

Models: OpenRouter, Google Gemini API, Anthropic, OpenAI, Groq, any
OpenAI/Gemini/Anthropic-compatible endpoint (Ollama, LM Studio, DeepSeek…), or
**copy & paste** through Claude.ai / ChatGPT / AI Studio with no key at all. Each
model's JSON request body is editable (e.g. add `"reasoning": {"effort": "low"}`).

## Deploying

Every push to `main` is checked (types, unit tests) and published to GitHub
Pages by `.github/workflows/deploy.yml`, at
`https://<owner>.github.io/logosnovus/`. One-time setup: the repository must be
public (or on a paid plan), and *Settings → Pages → Source* must be
**GitHub Actions**.

`npm run build` produces a static site in `dist/` that also runs from any other
host or sub-path (Cloudflare Pages, Netlify…).

Google sign-in uses the existing Firebase project (`src/firebase-config.json`).
Add the new site's domain once in the Firebase console → *Authentication →
Settings → Authorized domains*. The Firestore rules in `firestore.rules` already
restrict each account to its own data.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run e2e        # browser tests (Playwright, builds first)
npm run typecheck
```

See `CLAUDE.md` for how the code is organized.
