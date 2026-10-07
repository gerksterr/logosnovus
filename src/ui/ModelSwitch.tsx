import { useMemo } from 'react';
import { alive, put, useStore } from '../data/store';
import { activeModel } from '../llm/run';

/** Switches the active model everywhere (native select: best picker on Android). */
export function ModelSwitch({ compact = false, value, onChange }: { compact?: boolean; value?: string; onChange?: (id: string) => void }) {
  const models = useStore((s) => s.models);
  const prefs = useStore((s) => s.prefs.prefs);
  const list = useMemo(() => alive(models).sort((a, b) => (a.name || a.model).localeCompare(b.name || b.model)), [models]);
  useStore((s) => s.secrets); // re-evaluate the default when keys change
  const active = value ?? activeModel()?.id;
  const set = (id: string) => (onChange ? onChange(id) : put('prefs', { ...(prefs && !prefs.deleted ? prefs : {}), id: 'prefs', updatedAt: 0, modelId: id }));
  return (
    <select className={`input model-switch${compact ? ' compact' : ''}`} value={active ?? ''} onChange={(e) => set(e.target.value)} title="Model used for new requests" aria-label="Model">
      {list.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name || m.model}
          {m.provider === 'web' ? ' (copy & paste)' : ''}
        </option>
      ))}
    </select>
  );
}
