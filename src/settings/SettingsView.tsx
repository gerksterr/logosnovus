import { Cloud, Download, ExternalLink, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { go } from '../app/router';
import { confirmDialog, toast } from '../app/ui';
import { wipe } from '../data/db';
import { encodeShare, shareUrl } from '../data/share';
import { alive, flush, put, remove, useStore } from '../data/store';
import { BUILTIN_PROVIDERS } from '../llm/providers';
import { importLegacyCloud, signIn, signOut, syncNow, useSync } from '../sync/cloud';
import { STORE_NAMES, type Rec } from '../model/types';
import { allRecords, exportBackup, ImportButton } from './Backup';

export function SettingsView() {
  return (
    <div className="page settings">
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      <Keys />
      <Sync />
      <Data />
      <Storage />
    </div>
  );
}

function Keys() {
  const secrets = useStore((s) => s.secrets);
  const providers = useStore((s) => s.providers);
  const list = [...BUILTIN_PROVIDERS.filter((p) => p.id !== 'web'), ...alive(providers).map((p) => ({ id: p.id, name: `${p.name} (custom)`, keyUrl: undefined }))];
  return (
    <section className="section">
      <h2>API keys</h2>
      <p className="small faint">
        Keys stay on this device (and in your own cloud account if you turn that on below). They are sent only to the provider they belong to, never in exports or share links unless you ask.
      </p>
      {list.map((p) => (
        <KeyRow key={p.id} id={p.id} name={p.name} url={p.keyUrl} value={secrets[p.id]?.deleted ? '' : (secrets[p.id]?.key ?? '')} />
      ))}
      <p className="small faint">
        Free options: OpenRouter has free models (marked “free” in the model editor); Google AI Studio keys include a free Gemini tier. Copy & paste models (Claude.ai, ChatGPT,
        AI Studio) need no key at all. <button className="linkish" onClick={() => go('/prompts/models')}>Manage models →</button>
      </p>
    </section>
  );
}

function KeyRow({ id, name, url, value }: { id: string; name: string; url?: string; value: string }) {
  const [v, setV] = useState(value);
  const [show, setShow] = useState(false);
  useEffect(() => setV(value), [value]);
  const save = () => {
    if (v.trim() === value) return;
    if (v.trim()) put('secrets', { id, key: v.trim(), updatedAt: 0 });
    else remove('secrets', id);
    toast(`${name} key ${v.trim() ? 'saved' : 'removed'}.`);
  };
  return (
    <div className="key-row">
      <span className="key-name">{name}</span>
      <input
        className="input grow"
        type={show ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        value={v}
        placeholder="not set"
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onFocus={() => setShow(true)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {url && (
        <a className="icon-btn" href={url} target="_blank" rel="noopener noreferrer" title="Get a key">
          <ExternalLink size={16} />
        </a>
      )}
    </div>
  );
}

function Sync() {
  const sync = useSync();
  const prefs = useStore((s) => s.prefs.prefs);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const statusText: Record<typeof sync.status, string> = {
    off: 'Not signed in',
    connecting: 'Connecting…',
    synced: 'Everything is synced',
    syncing: `Syncing… ${sync.pending} change(s) to upload`,
    offline: `Offline — ${sync.pending} change(s) will upload when you're back online`,
    error: `Sync problem: ${sync.error ?? ''}`,
  };
  return (
    <section className="section">
      <h2>
        <Cloud size={18} /> Cloud sync
      </h2>
      <p className="small faint">
        Sign in with Google to keep texts, translations, calques, prompts and models in sync across your devices. Each change is uploaded on its own a few seconds after
        it happens; other devices receive it live.
      </p>
      <p className={sync.status === 'error' ? 'error-text' : 'muted'}>
        {sync.user ? `${sync.user.name || sync.user.email} · ` : ''}
        {statusText[sync.status]}
      </p>
      <div className="row">
        {sync.user ? (
          <>
            <button className="btn" onClick={syncNow} disabled={busy}>
              Sync now
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await importLegacyCloud(true);
                  toast(`Imported ${r.merged} records from the previous app version${r.unanchored ? ` (${r.unanchored} passages no longer found in their texts)` : ''}.`);
                })
              }
            >
              Import from previous version's cloud save
            </button>
            <button className="btn ghost" onClick={() => run(signOut)} disabled={busy}>
              Sign out
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={() => run(signIn)} disabled={busy}>
            Sign in with Google
          </button>
        )}
      </div>
      <label className="check">
        <input type="checkbox" checked={!!prefs?.syncKeys} onChange={(e) => put('prefs', { ...(prefs && !prefs.deleted ? prefs : {}), id: 'prefs', updatedAt: 0, syncKeys: e.target.checked })} />
        Also sync API keys to my account (otherwise enter them once per device)
      </label>
    </section>
  );
}

function Data() {
  const [keys, setKeys] = useState(false);
  const shareAll = async () => {
    const url = shareUrl(await encodeShare(allRecords(false)));
    await navigator.clipboard.writeText(url);
    toast(`Library link copied (${Math.round(url.length / 1024)} KB). Very long links may be cut by some messengers — a backup file always works.`, 'info', 8000);
  };
  return (
    <section className="section">
      <h2>Backup & sharing</h2>
      <div className="row">
        <button className="btn" onClick={() => exportBackup(keys)}>
          <Download size={15} /> Export backup
        </button>
        <ImportButton />
        <button className="btn" onClick={() => shareAll().catch((e) => toast(String(e), 'error'))}>
          <Link2 size={15} /> Copy library link
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={keys} onChange={(e) => setKeys(e.target.checked)} /> Include API keys in the exported file
      </label>
      <p className="small faint">Imports and links merge into your library: nothing of yours is overwritten by an older copy. Old “Symbolic Text Decipher” backups import too.</p>
    </section>
  );
}

function Storage() {
  const [est, setEst] = useState<string>('');
  const counts = useStore(useShallow((s) => Object.fromEntries(STORE_NAMES.map((st) => [st, alive(s[st] as Record<string, Rec>).length]))));
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setEst(`${((e.usage ?? 0) / 1e6).toFixed(1)} MB used of ${((e.quota ?? 0) / 1e9).toFixed(1)} GB available`));
    navigator.storage?.persisted?.().then((p) => p && setEst((x) => `${x} · protected from eviction`));
  }, []);
  return (
    <section className="section">
      <h2>Storage</h2>
      <p className="small muted">
        {counts.texts} texts · {counts.translations} translations · {counts.calques} calques · {counts.prompts} prompts · {counts.models} models
      </p>
      <p className="small faint">{est}</p>
      <p className="small faint">Works offline: everything is stored on this device; only new AI requests and sync need a connection.</p>
      <button
        className="btn ghost danger"
        onClick={async () => {
          if (!(await confirmDialog('Erase all data on this device? Your cloud copy (if signed in) is not affected.', 'Erase'))) return;
          await flush();
          await wipe();
          localStorage.clear();
          location.reload();
        }}
      >
        Erase this device
      </button>
    </section>
  );
}
