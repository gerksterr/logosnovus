// Readable model picker (replaces a native <select>, whose popup ignored the
// theme on Windows). Desktop: dropdown under the button. Phones: bottom sheet.

import { Check, ChevronDown, Cpu, Globe, Search, Settings2 } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { go, useBackClose } from '../app/router';
import { alive, getRec, put, useStore } from '../data/store';
import { resolveProvider } from '../llm/providers';
import { activeModel, modelLabel } from '../llm/run';
import type { Model } from '../model/types';

export const isWeb = (m?: Model) => m?.provider === 'web';

export function providerName(m: Model): string {
  if (isWeb(m)) return 'Web chat';
  return resolveProvider(m.provider, useStore.getState().providers)?.name.replace(/^Google /, '') ?? m.provider;
}

export function hasKey(m: Model): boolean {
  if (isWeb(m)) return true;
  const p = resolveProvider(m.provider, useStore.getState().providers);
  return !!p && (!!p.custom || !!getRec('secrets', p.id));
}

export function setActiveModel(id: string) {
  const prefs = useStore.getState().prefs.prefs;
  put('prefs', { ...(prefs && !prefs.deleted ? prefs : {}), id: 'prefs', updatedAt: 0, modelId: id });
}

export function ModelIcon({ m, size = 15 }: { m?: Model; size?: number }) {
  return isWeb(m) ? <Globe size={size} className="mi web" aria-hidden /> : <Cpu size={size} className="mi api" aria-hidden />;
}

interface Props {
  value?: string; // model id; '' = "follow default" when defaultLabel is set
  onChange?: (id: string) => void; // omitted: switches the active model everywhere
  compact?: boolean;
  defaultLabel?: string; // offer an entry that clears the choice
  only?: 'web' | 'api';
  className?: string;
}

export function ModelPicker({ value, onChange, compact = false, defaultLabel, only, className = '' }: Props) {
  const models = useStore((s) => s.models);
  useStore((s) => s.secrets); // key status
  useStore((s) => s.prefs);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const current = value === undefined ? activeModel() : value ? getRec('models', value) : undefined;
  const label = current ? modelLabel(current) : (defaultLabel ?? 'Choose a model');
  const set = (id: string) => {
    setOpen(false);
    if (onChange) onChange(id);
    else setActiveModel(id);
  };
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`mp-trigger${compact ? ' compact' : ''}${current ? (isWeb(current) ? ' web' : ' api') : ' none'} ${className}`}
        onClick={() => setOpen(!open)}
        title={current ? `${modelLabel(current)} · ${providerName(current)} · ${current.model}` : label}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ModelIcon m={current} />
        <span className="mp-name">{label}</span>
        {!compact && current && !isWeb(current) && <span className="mp-path mono">{current.model}</span>}
        <ChevronDown size={14} className="mp-chev" aria-hidden />
      </button>
      {open && (
        <ModelList
          anchor={btn.current}
          models={alive(models).filter((m) => !only || (only === 'web') === isWeb(m))}
          selected={value === undefined ? current?.id : value}
          defaultLabel={defaultLabel}
          onPick={set}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ModelList({
  anchor,
  models,
  selected,
  defaultLabel,
  onPick,
  onClose,
}: {
  anchor: HTMLElement | null;
  models: Model[];
  selected?: string;
  defaultLabel?: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  useBackClose(true, onClose);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const phone = innerWidth < 640;

  useLayoutEffect(() => {
    if (phone || !anchor || !ref.current) return setPos({});
    const r = anchor.getBoundingClientRect();
    const w = Math.min(420, innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
    const below = innerHeight - r.bottom - 12;
    const top = below > 280 ? r.bottom + 6 : Math.max(8, r.top - 6 - Math.min(ref.current.scrollHeight, innerHeight * 0.7));
    setPos({ left, top, width: w, maxHeight: below > 280 ? below : innerHeight * 0.7 });
  }, [anchor, phone]);

  const sorted = useMemo(() => {
    const f = q.trim().toLowerCase();
    const list = models.filter((m) => !f || `${modelLabel(m)} ${m.model} ${providerName(m)}`.toLowerCase().includes(f));
    return list.sort((a, b) => Number(hasKey(b)) - Number(hasKey(a)) || modelLabel(a).localeCompare(modelLabel(b)));
  }, [models, q]);
  const api = sorted.filter((m) => !isWeb(m));
  const web = sorted.filter(isWeb);

  const row = (m: Model) => {
    const ok = hasKey(m);
    return (
      <button key={m.id} role="option" aria-selected={selected === m.id} className={`mp-row${selected === m.id ? ' on' : ''}${ok ? '' : ' nokey'}`} onClick={() => onPick(m.id)}>
        <ModelIcon m={m} size={17} />
        <span className="mp-row-main">
          <span className="mp-row-name">{modelLabel(m)}</span>
          <span className="mp-row-meta">
            <span className={`badge ${isWeb(m) ? 'violet' : 'cyan'}`}>{providerName(m)}</span>
            {!isWeb(m) && <span className="mono faint">{m.model}</span>}
            {m.temperature != null && <span className="faint small">t {m.temperature}</span>}
            {!ok && <span className="badge danger">no key</span>}
          </span>
        </span>
        {selected === m.id && <Check size={16} className="mp-check" />}
      </button>
    );
  };

  return createPortal(
    <div className={`mp-backdrop${phone ? ' phone' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div ref={ref} className="mp-pop" style={pos} role="listbox">
        {phone && <div className="mp-grip" />}
        {models.length > 7 && (
          <label className="mp-search">
            <Search size={15} />
            <input autoFocus={!phone} placeholder="Find a model" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        )}
        <div className="mp-scroll">
          {defaultLabel && (
            <button className={`mp-row${!selected ? ' on' : ''}`} onClick={() => onPick('')}>
              <Settings2 size={17} className="mi" />
              <span className="mp-row-main">
                <span className="mp-row-name">{defaultLabel}</span>
                <span className="mp-row-meta faint small">currently {modelLabel(activeModel())}</span>
              </span>
              {!selected && <Check size={16} className="mp-check" />}
            </button>
          )}
          {api.length > 0 && <div className="mp-group">API · answers stream in</div>}
          {api.map(row)}
          {web.length > 0 && <div className="mp-group">Copy &amp; paste · your chat subscription, no key</div>}
          {web.map(row)}
          {!sorted.length && <div className="empty small">No model matches.</div>}
        </div>
        <button className="mp-foot" onClick={() => go('/prompts/models')}>
          <Settings2 size={14} /> Manage models &amp; keys
        </button>
      </div>
    </div>,
    document.body,
  );
}
