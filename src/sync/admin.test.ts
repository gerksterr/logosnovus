import { describe, expect, it } from 'vitest';
import { changedFields, planRevert, planUndo, type HistoryEntry } from './admin';

const e = (rev: number, by: string, title: string | null): HistoryEntry => ({
  hid: `texts~t@${rev}`, key: 'texts~t', st: 'texts', id: 't', rev, by, at: rev, u: rev,
  ...(title == null ? { del: true } : { j: JSON.stringify({ id: 't', title, updatedAt: rev }) }),
});

describe('undoing an account’s changes', () => {
  it('a record the account only edited goes back to before its edits', () => {
    const p = planRevert('vandal', [e(1, 'alice', 'Good'), e(2, 'vandal', 'Bad'), e(3, 'vandal', 'Worse')]);
    expect(p).toMatchObject({ fromRev: 3, toRev: 1, conflict: false, restore: { j: e(1, 'alice', 'Good').j } });
  });

  it('a record the account created is removed', () => {
    expect(planRevert('vandal', [e(1, 'vandal', 'Spam')])).toMatchObject({ toRev: 0, restore: { del: true } });
  });

  it('a record the account deleted comes back', () => {
    expect(planRevert('vandal', [e(1, 'alice', 'Good'), e(2, 'vandal', null)])?.restore.j).toContain('Good');
  });

  it('later changes by others make it a conflict, restoring the state before the account', () => {
    const p = planRevert('vandal', [e(1, 'alice', 'Good'), e(2, 'vandal', 'Bad'), e(3, 'bob', 'Bad but fixed typo')]);
    expect(p).toMatchObject({ conflict: true, toRev: 1, lastBy: 'bob' });
  });

  it('nothing to do when the account changed nothing or it is already undone', () => {
    expect(planRevert('vandal', [e(1, 'alice', 'Good')])).toBeNull();
    const undone = { ...e(3, 'admin', 'Good'), j: e(1, 'alice', 'Good').j }; // an undo writes the earlier content back as it was
    expect(planRevert('vandal', [e(1, 'alice', 'Good'), e(2, 'vandal', 'Bad'), undone])).toBeNull();
  });

  it('undoing one change restores the revision before it', () => {
    const chain = [e(1, 'alice', 'A'), e(2, 'bob', 'B'), e(3, 'carol', 'C')];
    expect(planUndo(chain[2], chain)).toMatchObject({ toRev: 2, conflict: false });
    expect(planUndo(chain[1], chain)).toMatchObject({ toRev: 1, conflict: true });
  });

  it('shows which fields changed', () => {
    expect(changedFields('{"title":"A","updatedAt":1,"x":1}', '{"title":"B","updatedAt":2,"x":1}')).toEqual([{ field: 'title', from: 'A', to: 'B' }]);
  });
});
