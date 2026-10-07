// Quick dictionary: Wiktionary's definition API (free, no key, CORS-enabled,
// covers German, Ancient Greek, Hebrew, Latin…). Not stored; cached per session.

import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { langName } from '../data/selectors';
import { getRec } from '../data/store';
import type { Target } from '../data/selectors';

interface Sense {
  pos: string;
  defs: string[];
}

const cache = new Map<string, Sense[] | null>();
const strip = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';

async function lookup(word: string, code: string | undefined, name: string): Promise<Sense[] | null> {
  const variants = [...new Set([word, word.toLowerCase(), word[0].toUpperCase() + word.slice(1).toLowerCase()])];
  for (const v of variants) {
    const key = `${code}|${v}`;
    if (!cache.has(key)) {
      try {
        const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(v)}`);
        if (!res.ok) {
          cache.set(key, null);
          continue;
        }
        const j = await res.json();
        const entries: { language?: string; partOfSpeech?: string; definitions?: { definition: string }[] }[] =
          (code && j[code]) || Object.values(j).flat().filter((e: any) => e?.language === name);
        cache.set(
          key,
          entries?.length ? entries.map((e) => ({ pos: e.partOfSpeech ?? '', defs: (e.definitions ?? []).map((d) => strip(d.definition)).filter(Boolean) })) : null,
        );
      } catch {
        throw new Error('offline');
      }
    }
    const hit = cache.get(key);
    if (hit) return hit;
  }
  return null;
}

export function Dictionary({ target, onAskAI }: { target: Target; onAskAI: () => void }) {
  const lang = getRec('langs', target.lang);
  const name = langName(target.lang);
  const [state, setState] = useState<{ loading: boolean; senses?: Sense[] | null; error?: string }>({ loading: true });
  useEffect(() => {
    setState({ loading: true });
    lookup(target.text, lang?.code, name)
      .then((senses) => setState({ loading: false, senses }))
      .catch(() => setState({ loading: false, error: 'The dictionary needs a connection.' }));
  }, [target.text, lang?.code, name]);
  const url = `https://en.wiktionary.org/wiki/${encodeURIComponent(target.text)}${name ? `#${name.replace(/ /g, '_')}` : ''}`;
  return (
    <div className="dict">
      {state.loading && (
        <div className="row muted">
          <span className="spin" /> Looking up…
        </div>
      )}
      {state.error && <p className="muted">{state.error}</p>}
      {state.senses === null && <p className="muted">No {name || ''} entry found for “{target.text}”.</p>}
      {state.senses?.map((s, i) => (
        <div key={i} className="sense">
          <div className="pos">{s.pos}</div>
          <ol>
            {s.defs.slice(0, 6).map((d, k) => (
              <li key={k}>{d}</li>
            ))}
          </ol>
        </div>
      ))}
      <div className="row">
        <button className="btn primary" onClick={onAskAI}>
          Ask AI
        </button>
        <a className="btn ghost" href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} /> Wiktionary
        </a>
      </div>
    </div>
  );
}
