import { Send, Square } from 'lucide-react';
import { useState } from 'react';
import { isTouch } from '../app/settings';
import { useStore } from '../data/store';
import { startChat, stopQuery, useQueries } from '../llm/queries';
import { Markdown } from '../ui/Markdown';

/** Follow-up conversation about one saved translation version (stored on that version). */
export function Chat({ translationId }: { translationId: string }) {
  const tr = useStore((s) => s.translations[translationId]);
  const q = useQueries((s) => s.queries.find((x) => x.key === `chat|${translationId}` && x.status === 'running'));
  const failed = useQueries((s) => s.queries.find((x) => x.key === `chat|${translationId}` && x.status === 'error'));
  const [draft, setDraft] = useState('');
  if (!tr) return null;
  const send = () => {
    const m = draft.trim();
    if (!m || q) return;
    if (startChat('translations', translationId, m)) setDraft('');
  };
  return (
    <div className="chat">
      {(tr.chat ?? []).map((m, i) => (
        <div key={i} className={`msg ${m.role}`}>
          {m.role === 'user' ? <div className="user-text">{m.content}</div> : <Markdown text={m.content} />}
        </div>
      ))}
      {q && (
        <div className="msg assistant">
          {q.content ? <Markdown text={q.content} /> : <div className="row small muted"><span className="spin" /> {q.reasoning ? 'Thinking…' : 'Waiting for the model…'}</div>}
        </div>
      )}
      {failed?.error && !q && <p className="error-text small">{failed.error}</p>}
      <div className="chat-input">
        <textarea
          className="input"
          rows={Math.min(8, Math.max(1, draft.split('\n').length))}
          placeholder="Ask about this translation…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // desktop: Enter sends, Shift+Enter breaks the line; touch keyboards: Enter breaks the line
            if (e.key === 'Enter' && !e.shiftKey && !isTouch()) {
              e.preventDefault();
              send();
            }
          }}
        />
        {q ? (
          <button className="icon-btn" onClick={() => stopQuery(q.id)} title="Stop">
            <Square size={16} />
          </button>
        ) : (
          <button className="icon-btn on" onClick={send} disabled={!draft.trim()} title="Send">
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
