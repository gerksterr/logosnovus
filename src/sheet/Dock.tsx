// Running and unseen requests. Several can run at once; a finished one stays
// here until it has been looked at (opening it, or closing it after it finished).

import { Check, CircleAlert, X } from 'lucide-react';
import { useUI } from '../app/ui';
import { go } from '../app/router';
import { targetKey } from '../data/selectors';
import { dismissQuery, isFor, useQueries } from '../llm/queries';

export function Dock() {
  const queries = useQueries((s) => s.queries);
  const sheetTarget = useUI((s) => s.sheet?.target);
  const sheetKey = sheetTarget ? targetKey(sheetTarget) : null;
  // requests for the target in the open sheet are shown there
  const visible = queries.filter((q) => q.kind !== 'chat' && !(sheetKey && isFor(q, sheetKey)) && (q.status === 'running' || (!q.seen && q.status !== 'stopped')));
  if (!visible.length) return null;
  return (
    <div className="dock" aria-label="Requests">
      {visible.map((q) => (
        <div key={q.id} className={`dock-item ${q.status}`}>
          <button
            className="dock-open"
            onClick={() => {
              if (q.kind === 'calque') {
                if (q.status !== 'running') dismissQuery(q.id);
                if (q.textId) go(`/read/${encodeURIComponent(q.textId)}`);
                return;
              }
              if (q.target) useUI.setState({ sheet: { target: q.target, queryId: q.id, mode: 'view' } });
            }}
          >
            {q.status === 'running' ? <span className="spin" /> : q.status === 'done' ? <Check size={14} /> : <CircleAlert size={14} />}
            <span className="dock-title" dir="auto">
              {q.title}
            </span>
            <span className="dock-model">{q.model}</span>
          </button>
          <button className="icon-btn" onClick={() => dismissQuery(q.id)} aria-label={q.status === 'running' ? 'Stop' : 'Dismiss'}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
