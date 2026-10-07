// OpenRouter's public model list (no key needed) for model-path autocomplete,
// with prices and free models marked. Cached for a day.

import { useEffect, useState } from 'react';
import { getMeta, setMeta } from '../data/db';

export interface CatalogModel {
  id: string;
  name: string;
  context: number;
  inPrice: string; // $ per million tokens
  outPrice: string;
  free: boolean;
}

let memo: CatalogModel[] | null = null;

const perMillion = (p: unknown) => {
  const n = Number(p) * 1e6;
  return Number.isFinite(n) ? (n < 1 ? n.toFixed(2) : n.toFixed(n < 10 ? 2 : 0)) : '?';
};

async function load(): Promise<CatalogModel[]> {
  if (memo) return memo;
  const cached = await getMeta<{ at: number; list: CatalogModel[] }>('openrouter-models').catch(() => undefined);
  if (cached && Date.now() - cached.at < 86400000) return (memo = cached.list);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    const j = await res.json();
    const list: CatalogModel[] = (j.data ?? []).map((m: any) => ({
      id: m.id,
      name: m.name ?? m.id,
      context: m.context_length ?? 0,
      inPrice: perMillion(m.pricing?.prompt),
      outPrice: perMillion(m.pricing?.completion),
      free: String(m.id).endsWith(':free') || (Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0),
    }));
    list.sort((a, b) => Number(b.free) - Number(a.free) || a.id.localeCompare(b.id));
    void setMeta('openrouter-models', { at: Date.now(), list });
    return (memo = list);
  } catch {
    return cached?.list ?? [];
  }
}

export function useOpenRouterModels(enabled: boolean): CatalogModel[] {
  const [list, setList] = useState<CatalogModel[]>(memo ?? []);
  useEffect(() => {
    if (enabled) load().then(setList);
  }, [enabled]);
  return enabled ? list : [];
}
