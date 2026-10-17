// Copy & paste through a chat website (Claude.ai, ChatGPT, AI Studio…), no API
// key needed: the prompt goes to the clipboard, the answer is pasted back.
// Shared by new translations and follow-up questions so both work the same way.

import { Copy, ExternalLink } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from '../app/ui';
import { getRec } from '../data/store';
import type { Model } from '../model/types';
import { Markdown } from '../ui/Markdown';
import { ModelPicker } from '../ui/ModelPicker';

export function WebPaste({
  prompt,
  note,
  modelId,
  onModel,
  onSave,
  saveLabel,
  onCancel,
  children,
}: {
  prompt: string;
  note?: string; // shown after "The prompt is on your clipboard"
  modelId: string;
  onModel: (id: string) => void;
  onSave: (answer: string, model: Model | undefined) => void;
  saveLabel: string;
  onCancel?: () => void;
  children?: ReactNode; // extra options between the buttons and the prompt
}) {
  const [answer, setAnswer] = useState('');
  const model = getRec('models', modelId);
  useEffect(() => {
    navigator.clipboard?.writeText(prompt).catch(() => {});
  }, [prompt]);
  return (
    <div className="web-assist">
      <div className="wa-steps">
        <div className="wa-step">
          <span className="wa-n">1</span> The prompt is on your clipboard{note ? ` (${note})` : ''}.
        </div>
        <div className="wa-step">
          <span className="wa-n">2</span> Paste it into the chat, then copy the answer.
        </div>
        <div className="wa-step">
          <span className="wa-n">3</span> Paste the answer below and save it.
        </div>
      </div>
      <div className="row">
        <ModelPicker value={modelId} onChange={onModel} only="web" />
        <button className="btn" onClick={() => navigator.clipboard.writeText(prompt).then(() => toast('Prompt copied.'))}>
          <Copy size={14} /> Copy prompt
        </button>
        {model?.siteUrl && (
          <a className="btn violet" href={model.siteUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> Open {model.model}
          </a>
        )}
      </div>
      {children}
      <details className="raw">
        <summary>Prompt</summary>
        <pre>{prompt}</pre>
      </details>
      <textarea className="input" rows={8} placeholder="Paste the answer here" value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <div className="row end">
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          className="btn ghost"
          onClick={() =>
            navigator.clipboard
              .readText()
              .then(setAnswer)
              .catch(() => toast('Clipboard access was blocked; paste manually.', 'error'))
          }
        >
          Paste from clipboard
        </button>
        <button className="btn primary" disabled={!answer.trim()} onClick={() => onSave(answer.trim(), model)}>
          {saveLabel}
        </button>
      </div>
      {answer.trim() && <Markdown text={answer} />}
    </div>
  );
}
