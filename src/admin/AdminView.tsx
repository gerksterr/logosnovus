// The administrator's page: every change to the shared library by account,
// undoing a change or all of an account's changes, blocking accounts, and the
// one-time database setup. Only gerksterr@gmail.com can use it; the database
// rules enforce that, this page only follows them.

import { ArrowDown, ArrowUp, Ban, ClipboardCopy, ExternalLink, RotateCcw, Search, ShieldCheck, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { confirmDialog, toast } from '../app/ui';
import config from '../firebase-config.json';
import rulesText from '../../firestore.rules?raw';
import {
  applyRevert,
  changedFields,
  entryLabel,
  historyOf,
  listAccounts,
  listBanned,
  planUndo,
  prepareRevertAccount,
  recentHistory,
  setBanned,
  type Account,
  type HistoryEntry,
  type RevertItem,
} from '../sync/admin';
import { isAdmin, pendingCounts, reconnectCommons, republishAll, signIn, useSync } from '../sync/cloud';
import { Modal } from '../ui/Modal';

type Tab = 'activity' | 'accounts' | 'setup';
type SortKey = 'at' | 'who' | 'st' | 'action';

const STORE_LABEL: Record<string, string> = { texts: 'Text', translations: 'Translation', calques: 'Calque', prompts: 'Prompt', models: 'Model', langs: 'Language', providers: 'Endpoint', lemmas: 'Word form' };
const action = (e: HistoryEntry) => (e.revert ? 'undo' : e.del ? 'deleted' : e.rev === 1 ? 'created' : 'edited');
const fmt = (t: number) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export function AdminView() {
  const sync = useSync();
  const admin = isAdmin(sync.user);
  const [tab, setTab] = useState<Tab>('activity');
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [banned, setBannedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [who, setWho] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [h, a, b] = await Promise.all([recentHistory(500), listAccounts(), listBanned()]);
      setEntries(h);
      setAccounts(a);
      setBannedSet(b);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (admin) void load();
  }, [admin]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) if (e.name) m.set(e.by, e.name);
    for (const a of accounts) m.set(a.uid, a.name || a.email || a.uid);
    return m;
  }, [entries, accounts]);

  if (!sync.user)
    return (
      <div className="page">
        <div className="empty">
          <p>This page is for the administrator of the shared library.</p>
          <button className="btn primary" onClick={() => signIn().catch((e) => toast((e as Error).message, 'error'))}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  if (!admin)
    return (
      <div className="page">
        <div className="empty">Only the administrator ({'gerksterr@gmail.com'}) can use this page.</div>
      </div>
    );

  return (
    <div className="page wide admin">
      <section className="hero">
        <div className="hero-text">
          <span className="badge amber caps">
            <ShieldCheck size={12} /> Administration
          </span>
          <h1>Shared library</h1>
          <p>
            {sync.commons === 'live' ? 'Connected' : sync.commons === 'unavailable' ? 'Not reachable — see Setup' : 'Connecting…'} · {accounts.length} accounts ·{' '}
            {entries.length}
            {entries.length >= 500 ? '+' : ''} recent changes
          </p>
        </div>
        <div className="hero-actions">
          <button className="btn" onClick={() => void load()} disabled={loading}>
            <RotateCcw size={15} /> Refresh
          </button>
        </div>
      </section>
      <div className="seg tabs">
        {(['activity', 'accounts', 'setup'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'activity' ? 'Activity' : t === 'accounts' ? 'Accounts' : 'Setup'}
          </button>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      {tab === 'activity' && (
        <Activity
          entries={entries}
          names={names}
          who={who}
          setWho={setWho}
          onMore={async () => {
            const more = await recentHistory(500, entries.at(-1)?.at);
            setEntries([...entries, ...more]);
          }}
          onChanged={() => void load()}
        />
      )}
      {tab === 'accounts' && (
        <Accounts
          accounts={accounts}
          entries={entries}
          banned={banned}
          names={names}
          onShow={(uid) => {
            setWho(uid);
            setTab('activity');
          }}
          onChanged={() => void load()}
        />
      )}
      {tab === 'setup' && <Setup />}
    </div>
  );
}

// ---------------------------------------------------------------- activity

function Activity({
  entries,
  names,
  who,
  setWho,
  onMore,
  onChanged,
}: {
  entries: HistoryEntry[];
  names: Map<string, string>;
  who: string;
  setWho: (s: string) => void;
  onMore: () => Promise<void>;
  onChanged: () => void;
}) {
  const [q, setQ] = useState('');
  const [store, setStore] = useState('');
  const [act, setAct] = useState('');
  const [since, setSince] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'at', desc: true });
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const from = since ? new Date(since).getTime() : 0;
    const list = entries.filter(
      (e) =>
        (!who || e.by === who) &&
        (!store || e.st === store) &&
        (!act || action(e) === act) &&
        e.at >= from &&
        (!needle || `${entryLabel(e)} ${names.get(e.by) ?? ''} ${e.id}`.toLowerCase().includes(needle)),
    );
    const val = (e: HistoryEntry): string | number => (sort.key === 'at' ? e.at : sort.key === 'who' ? (names.get(e.by) ?? e.by) : sort.key === 'st' ? e.st : action(e));
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.desc ? -c : c;
    });
  }, [entries, q, who, store, act, since, sort, names]);

  const head = (key: SortKey, label: string) => (
    <th>
      <button className="th-sort" onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key === 'at' })}>
        {label} {sort.key === key && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </button>
    </th>
  );
  const people = [...new Set(entries.map((e) => e.by))].sort((a, b) => (names.get(a) ?? a).localeCompare(names.get(b) ?? b));

  return (
    <section>
      <div className="filters card">
        <div className="filter-row">
          <label className="search grow">
            <Search size={16} />
            <input className="input" placeholder="Find a record or a person" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Account">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p} value={p}>
                {names.get(p) ?? p}
              </option>
            ))}
          </select>
          <select className="input" value={store} onChange={(e) => setStore(e.target.value)} aria-label="Kind">
            <option value="">All kinds</option>
            {Object.entries(STORE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select className="input" value={act} onChange={(e) => setAct(e.target.value)} aria-label="Action">
            <option value="">All actions</option>
            <option value="created">Created</option>
            <option value="edited">Edited</option>
            <option value="deleted">Deleted</option>
            <option value="undo">Undone</option>
          </select>
          <input className="input date" type="date" value={since} onChange={(e) => setSince(e.target.value)} aria-label="Since" />
        </div>
      </div>
      <p className="small muted">
        {rows.length} of {entries.length} changes
      </p>
      <div className="table-wrap">
        <table className="activity">
          <thead>
            <tr>
              {head('at', 'When')}
              {head('who', 'Account')}
              {head('action', 'Action')}
              {head('st', 'Kind')}
              <th>Record</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 400).map((e) => (
              <ActivityRow key={e.hid} e={e} name={names.get(e.by) ?? e.by} open={open === e.hid} onToggle={() => setOpen(open === e.hid ? null : e.hid)} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 400 && <p className="small muted">Showing the first 400; narrow the filters to see others.</p>}
      {entries.length >= 500 && (
        <button className="btn" onClick={() => void onMore()}>
          Load older changes
        </button>
      )}
    </section>
  );
}

function ActivityRow({ e, name, open, onToggle, onChanged }: { e: HistoryEntry; name: string; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const [chain, setChain] = useState<HistoryEntry[] | null>(null);
  useEffect(() => {
    if (open && !chain) void historyOf(e.key).then(setChain);
  }, [open]);
  const prev = chain?.filter((x) => x.rev < e.rev).at(-1);
  const undo = async () => {
    if (!chain) return;
    const plan = planUndo(e, chain);
    if (!plan) return toast('Nothing to undo: the record already has this content.');
    const later = plan.conflict ? ` It was changed again later (latest by ${chain.at(-1)?.name || chain.at(-1)?.by}); those later changes are undone too.` : '';
    if (!(await confirmDialog(`Undo this change to “${entryLabel(e)}”? The record goes back to ${plan.toRev ? `revision ${plan.toRev}` : 'not existing'}.${later}`, 'Undo')))
      return;
    const admin = useSync.getState().user!;
    await applyRevert([plan], admin);
    toast('Undone.');
    onChanged();
  };
  return (
    <>
      <tr className={`act-row ${action(e)}${open ? ' open' : ''}`} onClick={onToggle}>
        <td className="nowrap">{fmt(e.at)}</td>
        <td>{name}</td>
        <td>
          <span className={`badge ${action(e) === 'deleted' ? 'danger' : action(e) === 'undo' ? 'cyan' : action(e) === 'created' ? 'green' : ''}`}>{action(e)}</span>
        </td>
        <td>{STORE_LABEL[e.st] ?? e.st}</td>
        <td className="act-label" dir="auto">
          {entryLabel(e)} <span className="faint small">rev {e.rev}</span>
        </td>
      </tr>
      {open && (
        <tr className="act-detail">
          <td colSpan={5}>
            {!chain ? (
              <span className="spin" />
            ) : (
              <div className="act-diff">
                {e.del ? (
                  <p className="small">Deleted.</p>
                ) : (
                  <table>
                    <tbody>
                      {changedFields(prev?.del ? undefined : prev?.j, e.j).map((c) => (
                        <tr key={c.field}>
                          <th>{c.field}</th>
                          <td className="from">{c.from}</td>
                          <td className="to">{c.to}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="row">
                  <span className="small faint grow">
                    {chain.length} revisions · latest by {chain.at(-1)?.name || chain.at(-1)?.by}
                  </span>
                  <button className="btn small" onClick={() => void undo()}>
                    <Undo2 size={13} /> Undo this change
                  </button>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------- accounts

function Accounts({
  accounts,
  entries,
  banned,
  names,
  onShow,
  onChanged,
}: {
  accounts: Account[];
  entries: HistoryEntry[];
  banned: Set<string>;
  names: Map<string, string>;
  onShow: (uid: string) => void;
  onChanged: () => void;
}) {
  const [revert, setRevert] = useState<{ uid: string; items: RevertItem[] | null } | null>(null);
  const [sort, setSort] = useState<'last' | 'name' | 'changes'>('last');
  const counts = useMemo(() => {
    const m = new Map<string, { n: number; last: number }>();
    for (const e of entries) {
      const c = m.get(e.by) ?? { n: 0, last: 0 };
      c.n++;
      c.last = Math.max(c.last, e.at);
      m.set(e.by, c);
    }
    return m;
  }, [entries]);
  const all = useMemo(() => {
    const known = new Map(accounts.map((a) => [a.uid, a]));
    for (const uid of counts.keys()) if (!known.has(uid)) known.set(uid, { uid, name: names.get(uid) ?? '', email: '' });
    return [...known.values()].sort((a, b) =>
      sort === 'name' ? (a.name || a.email).localeCompare(b.name || b.email) : sort === 'changes' ? (counts.get(b.uid)?.n ?? 0) - (counts.get(a.uid)?.n ?? 0) : (b.last ?? counts.get(b.uid)?.last ?? 0) - (a.last ?? counts.get(a.uid)?.last ?? 0),
    );
  }, [accounts, counts, names, sort]);

  const toggleBan = async (a: Account) => {
    const on = !banned.has(a.uid);
    if (on && !(await confirmDialog(`Block ${a.name || a.email || a.uid}? They can still read the library but no longer change it.`, 'Block'))) return;
    await setBanned(a.uid, on);
    toast(on ? 'Blocked.' : 'Unblocked.');
    onChanged();
  };

  return (
    <section>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="small muted grow">Sort by</span>
        <div className="seg">
          {(['last', 'name', 'changes'] as const).map((s) => (
            <button key={s} className={sort === s ? 'on' : ''} onClick={() => setSort(s)}>
              {s === 'last' ? 'Last active' : s === 'name' ? 'Name' : 'Changes'}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="activity">
          <thead>
            <tr>
              <th>Account</th>
              <th>Changes</th>
              <th>First seen</th>
              <th>Last active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {all.map((a) => (
              <tr key={a.uid} className={banned.has(a.uid) ? 'blocked' : ''}>
                <td>
                  <div>{a.name || a.uid}</div>
                  <div className="small faint">{a.email}</div>
                  {banned.has(a.uid) && <span className="badge danger">blocked</span>}
                </td>
                <td>{counts.get(a.uid)?.n ?? 0}</td>
                <td className="nowrap">{fmt(a.first ?? 0)}</td>
                <td className="nowrap">{fmt(a.last ?? counts.get(a.uid)?.last ?? 0)}</td>
                <td>
                  <div className="row tight">
                    <button className="btn small" onClick={() => onShow(a.uid)}>
                      Activity
                    </button>
                    <button
                      className="btn small"
                      onClick={() => {
                        setRevert({ uid: a.uid, items: null });
                        void prepareRevertAccount(a.uid).then((items) => setRevert({ uid: a.uid, items }));
                      }}
                    >
                      <Undo2 size={13} /> Undo all…
                    </button>
                    <button className={`btn small${banned.has(a.uid) ? '' : ' danger'}`} onClick={() => void toggleBan(a)}>
                      <Ban size={13} /> {banned.has(a.uid) ? 'Unblock' : 'Block'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {revert && <RevertModal uid={revert.uid} name={names.get(revert.uid) ?? revert.uid} items={revert.items} onClose={() => setRevert(null)} onDone={onChanged} />}
    </section>
  );
}

function RevertModal({ uid, name, items, onClose, onDone }: { uid: string; name: string; items: RevertItem[] | null; onClose: () => void; onDone: () => void }) {
  const [withConflicts, setWithConflicts] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const chosen = items?.filter((i) => withConflicts || !i.conflict) ?? [];
  const conflicts = items?.filter((i) => i.conflict).length ?? 0;
  const run = async () => {
    setBusy(0);
    try {
      const n = await applyRevert(chosen, useSync.getState().user!, setBusy);
      toast(`Undid ${name}'s changes to ${n} records.`);
      onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(null);
    }
  };
  return (
    <Modal
      title={`Undo all changes by ${name}`}
      onClose={onClose}
      footer={
        <div className="row end">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary danger-fill" disabled={!chosen.length || busy != null} onClick={() => void run()}>
            {busy != null ? `Undoing… ${busy}/${chosen.length}` : `Undo ${chosen.length} records`}
          </button>
        </div>
      }
    >
      {!items ? (
        <p className="row">
          <span className="spin" /> Reading {name}'s history…
        </p>
      ) : !items.length ? (
        <p>Nothing to undo: {name}'s changes are already undone or were never made.</p>
      ) : (
        <>
          <p>
            {items.length - conflicts} records go back to how they were before {name} changed them (records {name} created are removed; records {name} deleted come
            back). Each undo is recorded and can itself be undone.
          </p>
          {conflicts > 0 && (
            <label className="check">
              <input type="checkbox" checked={withConflicts} onChange={(e) => setWithConflicts(e.target.checked)} /> Also the {conflicts} records others changed after{' '}
              {name} (their later changes are undone too)
            </label>
          )}
          <ul className="small revert-list">
            {items.slice(0, 50).map((i) => (
              <li key={i.key} className={i.conflict ? 'faint' : ''}>
                {STORE_LABEL[i.st] ?? i.st} {i.id} → {i.toRev ? `revision ${i.toRev}` : 'removed'}
                {i.conflict ? ' (changed later by others)' : ''}
              </li>
            ))}
            {items.length > 50 && <li>…and {items.length - 50} more</li>}
          </ul>
          <p className="small faint">Account id: {uid}</p>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- setup

function Setup() {
  const sync = useSync();
  const project = config.projectId;
  const dbId = config.firestoreDatabaseId;
  const { shared } = pendingCounts();
  return (
    <section className="setup">
      <div className="setup-step card">
        <h3>1 · Database rules {sync.commons === 'live' ? <span className="badge green">working</span> : <span className="badge danger">needed</span>}</h3>
        <p className="small muted">
          The rules make the library readable by everyone, writable by signed-in accounts, and keep the history that lets you undo anyone's changes. They are set once in
          the Firebase console: open the rules page, replace everything there with the copied rules, press <b>Publish</b>.
        </p>
        <div className="row">
          <button className="btn" onClick={() => void navigator.clipboard.writeText(rulesText).then(() => toast('Rules copied.'))}>
            <ClipboardCopy size={14} /> Copy the rules
          </button>
          <a className="btn" href={`https://console.firebase.google.com/project/${project}/firestore/databases/${dbId}/rules`} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> Open the rules page
          </a>
          <button className="btn" onClick={reconnectCommons}>
            <RotateCcw size={14} /> Check again
          </button>
        </div>
        {sync.commons === 'unavailable' && sync.commonsError && <p className="small error-text">{sync.commonsError}</p>}
      </div>
      <div className="setup-step card">
        <h3>2 · Google sign-in on this address</h3>
        <p className="small muted">
          If signing in says the address is not authorized, add <code>{location.hostname}</code> under Authentication → Settings → Authorized domains.
        </p>
        <a className="btn" href={`https://console.firebase.google.com/project/${project}/authentication/settings`} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} /> Open sign-in settings
        </a>
      </div>
      <div className="setup-step card">
        <h3>3 · Publish this device's library</h3>
        <p className="small muted">
          Everything on this device that is not in the shared library yet (except private texts and API keys) is uploaded, in small batches. {shared ? `${shared} changes are waiting.` : ''}
        </p>
        <button className="btn primary" onClick={() => (republishAll(), toast('Uploading…'))} disabled={sync.commons !== 'live'}>
          Upload my library
        </button>
      </div>
    </section>
  );
}
