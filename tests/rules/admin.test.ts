// Undoing a vandal's changes and blocking the account, as the admin does it
// from the app, against the emulator's real rules.

import 'fake-indexeddb/auto';
import * as fs from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, client, setup, teardown } from './env';

(globalThis as any).localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { useBackend } = await import('../../src/sync/cloud');
const { applyRevert, listBanned, prepareRevertAccount, recentHistory, setBanned } = await import('../../src/sync/admin');

async function writeAs(uid: string, rec: Record<string, any>, rev: number, store = 'texts') {
  const db = client({ uid });
  const key = `${store}~${rec.id}`;
  const content = rec.deleted ? { del: true } : { j: JSON.stringify(rec) };
  const b = fs.writeBatch(db);
  b.set(fs.doc(db, 'commons', key), { st: store, id: rec.id, u: rec.updatedAt, s: fs.serverTimestamp(), rev, by: uid, ...content });
  b.set(fs.doc(db, 'history', `${key}@${rev}`), { key, st: store, id: rec.id, rev, by: uid, at: fs.serverTimestamp(), u: rec.updatedAt, ...content });
  await b.commit();
}
const read = async (key: string) => (await fs.getDoc(fs.doc(client(), 'commons', key))).data();
const admin = { uid: ADMIN.uid, name: 'Admin', email: ADMIN.email };

beforeAll(async () => {
  await setup();
  useBackend({ fs, db: client(ADMIN) });
  const t = Date.now() - 10000;
  await writeAs('alice', { id: 'a', title: 'Good A', updatedAt: t }, 1);
  await writeAs('alice', { id: 'b', title: 'Good B', updatedAt: t }, 1);
  await writeAs('vandal', { id: 'a', title: 'SPAM A', updatedAt: t + 1 }, 2);
  await writeAs('vandal', { id: 'b', deleted: true, updatedAt: t + 1 }, 2);
  await writeAs('vandal', { id: 'c', title: 'SPAM C', updatedAt: t + 1 }, 1);
  await writeAs('vandal', { id: 'd', title: 'SPAM D', updatedAt: t + 1 }, 1);
  await writeAs('bob', { id: 'd', title: 'SPAM D, corrected by Bob', updatedAt: t + 2 }, 2);
});
afterAll(teardown);

describe('the admin', () => {
  it('sees recent activity, newest first', async () => {
    const h = await recentHistory(50);
    expect(h).toHaveLength(7);
    expect(h[0].at).toBeGreaterThanOrEqual(h.at(-1)!.at);
  });

  it('undoes everything an account did, leaving conflicts to decide', async () => {
    const plan = await prepareRevertAccount('vandal');
    expect(plan.map((p) => `${p.id}:${p.conflict}`).sort()).toEqual(['a:false', 'b:false', 'c:false', 'd:true']);
    const n = await applyRevert(plan.filter((p) => !p.conflict), admin);
    expect(n).toBe(3);
    expect(JSON.parse((await read('texts~a'))!.j).title).toBe('Good A');
    expect(JSON.parse((await read('texts~b'))!.j).title).toBe('Good B'); // deleted by the vandal: back
    expect((await read('texts~c'))!.del).toBe(true); // created by the vandal: gone
    expect(JSON.parse((await read('texts~d'))!.j).title).toContain('Bob'); // left alone
    const undo = (await recentHistory(1))[0];
    expect(undo).toMatchObject({ by: ADMIN.uid });
    expect(undo.revert).toMatch(/@\d+$/);
    expect(await prepareRevertAccount('vandal')).toHaveLength(1); // only the conflict remains
  });

  it('blocks and unblocks an account', async () => {
    await setBanned('vandal', true, 'spam');
    expect((await listBanned()).has('vandal')).toBe(true);
    await expect(writeAs('vandal', { id: 'e', title: 'more spam', updatedAt: Date.now() }, 1)).rejects.toThrow();
    await setBanned('vandal', false);
    expect((await listBanned()).has('vandal')).toBe(false);
  });
});
