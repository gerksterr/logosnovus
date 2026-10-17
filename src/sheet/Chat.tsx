import { Cpu, Globe, Send, Square } from 'lucide-react';
import { useState } from 'react';
import { isTouch } from '../app/settings';
import { alive, useStore } from '../data/store';
import { chatModel, chatPromptText, saveChatExchange, startChat, stopQuery, useQueries } from '../llm/queries';
import { activeModel, modelLabel } from '../llm/run';
import type { Model } from '../model/types';
import { Markdown } from '../ui/Markdown';
import { WebPaste } from './WebPaste';

/** Web model to start a copy & paste exchange with: the given one, else the active one, else the first. */
export function firstWeb(id: string | undefined, models: Record<string, Model>): string {
  const isWeb = (m?: Model) => !!m && !m.deleted && m.provider === 'web';
  if (id && isWeb(models[id])) return id;
  const active = activeModel();
  if (isWeb(active)) return active!.id;
  return alive(models).find(isWeb)?.id ?? '';
}

/**
 * Follow-up conversation about one saved translation version (stored on that
 * version). Uses the same model as a new translation would; with a web chat
 * model the question goes out by copy & paste and the pasted answer is saved.
 */
export function Chat({ translationId }: { translationId: string }) {
  const tr = useStore((s) => s.translations[translationId]);
  useStore((s) => s.models);
  useStore((s) => s.texts); // per-text model choice
  useStore((s) => s.prefs); // active model
  const q = useQueries((s) => s.queries.find((x) => x.key === `chat|${translationId}` && x.status === 'running'));
  const failed = useQueries((s) => s.queries.find((x) => x.key === `chat|${translationId}` && x.status === 'error'));
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<{ message: string; modelId: string } | null>(null);
  const [withContext, setWithContext] = useState(true);
  if (!tr) return null;
  const model = chatModel(tr);
  const web = model?.provider === 'web';

  const send = () => {
    const m = draft.trim();
    if (!m || q || pending) return;
    if (web) {
      setPending({ message: m, modelId: model.id });
      setDraft('');
      return;
    }
    if (startChat('translations', translationId, m)) setDraft('');
  };

  return (
    <div className="chat">
      {(tr.chat ?? []).map((m, i) => (
        <div key={i} className={`msg ${m.role}`}>
          {m.role === 'user' ? <div className="user-text">{m.content}</div> : <Markdown text={m.content} />}
          {m.role === 'assistant' && m.model && <div className="msg-model">{m.model}</div>}
        </div>
      ))}
      {q && (
        <div className="msg assistant">
          {q.content ? (
            <Markdown text={q.content} />
          ) : (
            <div className="row small muted">
              <span className="spin" /> {q.reasoning ? 'Thinking…' : 'Waiting for the model…'}
            </div>
          )}
        </div>
      )}
      {failed?.error && !q && <p className="error-text small">{failed.error}</p>}
      {pending ? (
        <>
          <div className="msg user pending">
            <div className="user-text">{pending.message}</div>
          </div>
          <WebPaste
            prompt={chatPromptText(tr, pending.message, withContext)}
            note={withContext ? 'your question with the conversation so far' : 'your question only'}
            modelId={pending.modelId}
            onModel={(id) => setPending({ ...pending, modelId: id })}
            saveLabel="Save answer"
            onCancel={() => {
              setDraft(pending.message);
              setPending(null);
            }}
            onSave={(answer, m) => {
              saveChatExchange(tr.id, pending.message, answer, m ? modelLabel(m) : 'web chat');
              setPending(null);
            }}
          >
            <label className="check small">
              <input type="checkbox" checked={withContext} onChange={(e) => setWithContext(e.target.checked)} /> Include the conversation so far (turn off when you continue in the
              chat that gave this answer)
            </label>
          </WebPaste>
        </>
      ) : (
        <>
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
              <button className="icon-btn on" onClick={send} disabled={!draft.trim()} title={web ? 'Send (copy & paste)' : 'Send'}>
                <Send size={16} />
              </button>
            )}
          </div>
          {model && (
            <div className="chat-via">
              {web ? <Globe size={12} /> : <Cpu size={12} />} Follow-ups go to {modelLabel(model)}
              {web ? ' by copy & paste' : ''}
            </div>
          )}
        </>
      )}
    </div>
  );
}
