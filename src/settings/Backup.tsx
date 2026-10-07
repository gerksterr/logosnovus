// Backup files: export, and import with a preview (also old-app backups and chat exports).

import { Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from '../app/ui';
import { convertLegacy, convertLegacyChats, isLegacyBackup, isLegacyChats } from '../data/legacy';
import { countBundle, isBackup, makeBackup, type Bundle } from '../data/merge';
import { alive, merge, useStore } from '../data/store';
import { STORE_NAMES, type Rec, type StoreName } from '../model/types';
import { Modal } from '../ui/Modal';

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function allRecords(includeKeys: boolean): Bundle {
  const s = useStore.getState();
  const out: Bundle = {};
  for (const st of STORE_NAMES) {
    if (st === 'secrets' && !includeKeys) continue;
    (out as Record<StoreName, Rec[]>)[st] = alive(s[st] as Record<string, Rec>).filter((r) => st !== 'texts' || !(r as { scratch?: boolean }).scratch);
  }
  return out;
}

export function exportBackup(includeKeys = false) {
  download(`logosnovus-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(makeBackup(allRecords(includeKeys))));
}

interface Pending {
  bundle: Bundle;
  note: string;
  keys: { provider: string; masked: string }[];
  legacy?: unknown;
}

export function ImportButton({ className = 'btn', label = 'Import backup' }: { className?: string; label?: string }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [importKeys, setImportKeys] = useState(false);
  const onFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (isBackup(data)) setPending({ bundle: data.records, note: 'Logos Novus backup', keys: (data.records.secrets ?? []).map((s) => ({ provider: s.id, masked: '••••' })) });
      else if (isLegacyBackup(data)) {
        const r = convertLegacy(data, { includeKeys: false });
        setPending({ bundle: r.bundle, note: `Backup from the previous app (Symbolic Text Decipher)${r.unanchored ? ` · ${r.unanchored} passages are no longer found in their texts and will be listed as “not found”` : ''}`, keys: r.keys, legacy: data });
      } else if (isLegacyChats(data)) {
        const t = convertLegacyChats(data, useStore.getState().translations);
        setPending({ bundle: { translations: t }, note: 'Chats exported by the previous app', keys: [] });
      } else toast('This file is not a backup I recognize.', 'error');
    } catch (e) {
      toast(`Could not read the file: ${(e as Error).message}`, 'error');
    }
  };
  const confirmImport = () => {
    if (!pending) return;
    let bundle = pending.bundle;
    if (pending.legacy && importKeys) bundle = convertLegacy(pending.legacy, { includeKeys: true }).bundle;
    if (!importKeys) bundle = { ...bundle, secrets: [] };
    const n = merge(bundle, 'import');
    setPending(null);
    toast(`Imported ${n} records. Existing newer versions were kept.`);
  };
  return (
    <>
      <label className={className}>
        <Upload size={15} /> {label}
        <input
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onFile(f);
          }}
        />
      </label>
      {pending && (
        <Modal
          title="Import"
          onClose={() => setPending(null)}
          footer={
            <div className="row end">
              <button className="btn ghost" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={confirmImport}>
                Import
              </button>
            </div>
          }
        >
          <p>{pending.note}</p>
          <ul className="small">
            {Object.entries(countBundle(pending.bundle))
              .filter(([k]) => k !== 'secrets')
              .map(([k, n]) => (
                <li key={k}>
                  {n} {k}
                </li>
              ))}
          </ul>
          {pending.keys.length > 0 && (
            <label className="check">
              <input type="checkbox" checked={importKeys} onChange={(e) => setImportKeys(e.target.checked)} /> Also import API keys ({pending.keys.map((k) => `${k.provider} ${k.masked}`).join(', ')})
            </label>
          )}
        </Modal>
      )}
    </>
  );
}
