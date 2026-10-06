import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Copy, 
  Check, 
  ExternalLink, 
  Clipboard, 
  Sparkles, 
  Plus, 
  Trash2, 
  Eye, 
  Code2, 
  AlertCircle,
  X,
  Bot
} from 'lucide-react';
import { WebAssistSite } from '../types';
import { 
  getStoredWebAssistSites, 
  saveStoredWebAssistSites, 
  addCustomWebAssistSite, 
  deleteCustomWebAssistSite 
} from '../services/storageService';
import { MarkdownRenderer } from './MarkdownRenderer';

interface WebAssistWorkspaceProps {
  prompt: string;
  targetText: string;
  blueprintName?: string;
  initialSiteUrl?: string;
  initialSiteName?: string;
  onApplyResponse: (responseText: string, siteName: string, siteUrl?: string) => void;
  onCancel?: () => void;
}

export const WebAssistWorkspace: React.FC<WebAssistWorkspaceProps> = ({
  prompt,
  targetText,
  blueprintName = 'Translation Exegesis',
  initialSiteUrl,
  initialSiteName,
  onApplyResponse,
  onCancel,
}) => {
  const [sites, setSites] = useState<WebAssistSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('claude-web');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showPromptDetails, setShowPromptDetails] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  // Modal for adding a custom web AI site
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [customSiteName, setCustomSiteName] = useState('');
  const [customSiteUrl, setCustomSiteUrl] = useState('');
  const [customSiteDescription, setCustomSiteDescription] = useState('');

  // Load sites on mount
  useEffect(() => {
    const loadedSites = getStoredWebAssistSites();
    setSites(loadedSites);

    // If initialSiteName or initialSiteUrl was provided, match it
    if (initialSiteUrl) {
      const match = loadedSites.find((s) => s.url === initialSiteUrl);
      if (match) {
        setSelectedSiteId(match.id);
      }
    } else if (initialSiteName) {
      const match = loadedSites.find(
        (s) => s.name.toLowerCase() === initialSiteName.toLowerCase()
      );
      if (match) {
        setSelectedSiteId(match.id);
      }
    }
  }, [initialSiteUrl, initialSiteName]);

  // Automatically copy the prompt to clipboard when the workspace opens
  useEffect(() => {
    if (prompt && prompt.trim()) {
      copyPromptToClipboard();
    }
  }, [prompt]);

  const copyPromptToClipboard = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard
        .writeText(prompt)
        .then(() => {
          setCopiedPrompt(true);
          setTimeout(() => setCopiedPrompt(false), 3500);
        })
        .catch(() => {
          setCopiedPrompt(false);
        });
    }
  };

  const handlePasteFromClipboard = async () => {
    setClipboardError(null);
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setResponseText(text.trim());
        } else {
          setClipboardError('Clipboard is empty. Copy the answer from the AI tab first.');
        }
      } catch (err: any) {
        setClipboardError('Clipboard read permission was denied. Please paste manually (Ctrl+V / Cmd+V).');
      }
    } else {
      setClipboardError('Clipboard API not supported in this browser. Please paste manually into the text box.');
    }
  };

  const activeSite = sites.find((s) => s.id === selectedSiteId) || sites[0] || {
    id: 'claude-web',
    name: 'Claude.ai',
    url: 'https://claude.ai/new',
  };

  const handleSaveCustomSite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSiteName.trim() || !customSiteUrl.trim()) return;

    let urlToSave = customSiteUrl.trim();
    if (!urlToSave.startsWith('http://') && !urlToSave.startsWith('https://')) {
      urlToSave = `https://${urlToSave}`;
    }

    const updated = addCustomWebAssistSite({
      name: customSiteName.trim(),
      url: urlToSave,
      description: customSiteDescription.trim() || undefined,
      badgeColor: 'purple',
    });

    setSites(updated);
    const newest = updated[updated.length - 1];
    if (newest) {
      setSelectedSiteId(newest.id);
    }
    setIsAddModalOpen(false);
    setCustomSiteName('');
    setCustomSiteUrl('');
    setCustomSiteDescription('');
  };

  const handleDeleteCustomSite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Remove this custom AI site?')) return;
    const updated = deleteCustomWebAssistSite(id);
    setSites(updated);
    if (selectedSiteId === id) {
      setSelectedSiteId('claude-web');
    }
  };

  const handleApply = () => {
    if (!responseText.trim()) return;
    onApplyResponse(responseText.trim(), `${activeSite.name} (Web)`, activeSite.url);
  };

  const getSiteBadgeColorClasses = (siteId: string, isSelected: boolean) => {
    if (isSelected) {
      switch (siteId) {
        case 'claude-web':
          return 'bg-purple-900/80 border-purple-500 text-purple-200 ring-1 ring-purple-400/50';
        case 'aistudio-web':
          return 'bg-blue-900/80 border-blue-500 text-blue-200 ring-1 ring-blue-400/50';
        case 'chatgpt-web':
          return 'bg-emerald-900/80 border-emerald-500 text-emerald-200 ring-1 ring-emerald-400/50';
        case 'deepseek-web':
          return 'bg-cyan-900/80 border-cyan-500 text-cyan-200 ring-1 ring-cyan-400/50';
        case 'perplexity-web':
          return 'bg-amber-900/80 border-amber-500 text-amber-200 ring-1 ring-amber-400/50';
        default:
          return 'bg-stone-800 border-amber-500 text-amber-200 ring-1 ring-amber-400/50';
      }
    }
    return 'bg-stone-900/90 border-stone-800 text-stone-300 hover:border-stone-700 hover:text-stone-100';
  };

  return (
    <div className="space-y-4 rounded-3xl bg-stone-950/90 border border-amber-800/40 p-4 sm:p-5 shadow-xl text-stone-100 animate-in fade-in-50 duration-200">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-800/80">
        <div className="space-y-0.5">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-xl bg-purple-950/80 text-purple-300 border border-purple-800/60 inline-flex items-center">
              <Globe className="w-4 h-4 text-purple-400" />
            </span>
            <h4 className="text-sm font-semibold text-amber-200 flex items-center space-x-1.5">
              <span>Web UI Assist Workflow</span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/70 font-bold">
                Zero Token Cost
              </span>
            </h4>
          </div>
          <p className="text-[11px] text-stone-400 leading-normal">
            Use your <strong>Claude Pro</strong>, <strong>Google AI Studio</strong>, or <strong>ChatGPT</strong> web subscription. Auto-copies the prompt, opens the web tab, and captures the response.
          </p>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="self-end sm:self-auto p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border border-stone-800 transition cursor-pointer"
            title="Cancel Web Assist"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Step 1: Prompt Generated & Copied Notice */}
      <div className="p-3.5 rounded-2xl bg-stone-900 border border-stone-800/80 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs">
            <span className="w-5 h-5 rounded-full bg-amber-600/30 text-amber-300 border border-amber-600/50 flex items-center justify-center font-bold text-[10px]">
              1
            </span>
            <span className="font-semibold text-stone-200">
              Prompt for <strong className="text-amber-300 font-medium">"{targetText}"</strong>
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {copiedPrompt && (
              <span className="text-[11px] text-emerald-400 flex items-center space-x-1 font-medium animate-in fade-in duration-200">
                <Check className="w-3.5 h-3.5" />
                <span>Copied to clipboard!</span>
              </span>
            )}
            <button
              type="button"
              onClick={copyPromptToClipboard}
              className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-amber-200 text-xs font-medium flex items-center space-x-1 border border-stone-700 transition cursor-pointer"
              title="Copy prompt text to clipboard"
            >
              <Copy className="w-3 h-3" />
              <span>{copiedPrompt ? 'Copied' : 'Copy Prompt'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPromptDetails(!showPromptDetails)}
              className="px-2 py-1 rounded-lg text-stone-400 hover:text-stone-200 text-xs transition underline"
            >
              {showPromptDetails ? 'Hide' : 'Inspect'}
            </button>
          </div>
        </div>

        {/* Collapsible Prompt Preview */}
        {showPromptDetails && (
          <div className="mt-2 p-3 rounded-xl bg-stone-950 border border-stone-800 text-[11px] font-mono text-stone-300 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {prompt}
          </div>
        )}
      </div>

      {/* Step 2: Choose Web AI & Open Tab */}
      <div className="p-3.5 rounded-2xl bg-stone-900 border border-stone-800/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs">
            <span className="w-5 h-5 rounded-full bg-amber-600/30 text-amber-300 border border-amber-600/50 flex items-center justify-center font-bold text-[10px]">
              2
            </span>
            <span className="font-semibold text-stone-200">
              Select AI Site & Launch Window
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center space-x-1 cursor-pointer"
            id="btn-add-custom-web-ai"
          >
            <Plus className="w-3 h-3" />
            <span>Add Custom AI Site</span>
          </button>
        </div>

        {/* Site Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
          {sites.map((site) => {
            const isSelected = site.id === selectedSiteId;
            return (
              <div
                key={site.id}
                onClick={() => setSelectedSiteId(site.id)}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between space-y-1.5 relative group ${getSiteBadgeColorClasses(
                  site.id,
                  isSelected
                )}`}
              >
                <div className="flex items-start justify-between">
                  <div className="font-medium text-xs truncate mr-1">
                    {site.name}
                  </div>
                  {site.isCustom && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteCustomSite(site.id, e)}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-stone-500 transition p-0.5 rounded cursor-pointer"
                      title="Remove site"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-stone-400 truncate max-w-[85px]">
                    {site.id === 'claude-web'
                      ? 'Claude Pro'
                      : site.id === 'aistudio-web'
                      ? 'Gemini Pro'
                      : site.id === 'chatgpt-web'
                      ? 'ChatGPT Plus'
                      : 'Web Chat'}
                  </span>
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyPromptToClipboard();
                    }}
                    className="inline-flex items-center space-x-0.5 text-[11px] font-semibold text-amber-400 hover:text-amber-300 hover:underline"
                    title={`Open ${site.name} in a new tab`}
                  >
                    <span>Open</span>
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* Primary Direct Launch Button */}
        <div className="pt-1.5 flex items-center justify-between text-xs">
          <p className="text-[11px] text-stone-400">
            Selected target: <strong className="text-amber-300 font-medium">{activeSite.name}</strong>
          </p>
          <a
            href={activeSite.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => copyPromptToClipboard()}
            className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-purple-100 font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-purple-950/60 transition active:scale-[0.98]"
            id="btn-open-active-web-ai"
          >
            <span>Launch {activeSite.name} (Tab ↗)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Step 3: Paste Response */}
      <div className="p-3.5 rounded-2xl bg-stone-900 border border-stone-800/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs">
            <span className="w-5 h-5 rounded-full bg-amber-600/30 text-amber-300 border border-amber-600/50 flex items-center justify-center font-bold text-[10px]">
              3
            </span>
            <span className="font-semibold text-stone-200">
              Paste AI Response from {activeSite.name}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-xs font-medium flex items-center space-x-1 transition cursor-pointer"
              title="Read clipboard text automatically"
              id="btn-paste-clipboard-web-assist"
            >
              <Clipboard className="w-3 h-3 text-emerald-400" />
              <span>Paste from Clipboard</span>
            </button>

            {responseText.trim() && (
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center space-x-1 border transition cursor-pointer ${
                  showPreview
                    ? 'bg-purple-900/70 text-purple-200 border-purple-700'
                    : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700'
                }`}
              >
                {showPreview ? <Code2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showPreview ? 'Edit Raw' : 'Preview'}</span>
              </button>
            )}
          </div>
        </div>

        {clipboardError && (
          <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-800 text-[11px] text-amber-200 flex items-start space-x-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>{clipboardError}</span>
          </div>
        )}

        {showPreview ? (
          <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 max-h-60 overflow-y-auto font-serif text-xs leading-relaxed text-stone-200">
            <MarkdownRenderer content={responseText} />
          </div>
        ) : (
          <textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder={`Paste the formatted response from ${activeSite.name} here... (e.g., etymology, root morphology, Latin/Greek cognates, or LaTeX formulas)`}
            rows={5}
            className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-stone-100 placeholder-stone-500 focus:outline-hidden focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/40 font-mono leading-relaxed"
            id="textarea-web-assist-response"
          />
        )}

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-stone-800/80">
          <div className="text-[11px] text-stone-400">
            {responseText.trim() ? (
              <span>
                {responseText.length} characters &bull; {responseText.trim().split(/\s+/).length} words
              </span>
            ) : (
              <span>Waiting for response from {activeSite.name}...</span>
            )}
          </div>

          <div className="flex items-center space-x-2 self-end sm:self-auto">
            {responseText.trim() && (
              <button
                type="button"
                onClick={() => setResponseText('')}
                className="px-3 py-1.5 rounded-xl text-stone-400 hover:text-stone-200 text-xs transition"
              >
                Clear
              </button>
            )}

            <button
              type="button"
              onClick={handleApply}
              disabled={!responseText.trim()}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-stone-950 font-bold text-xs flex items-center space-x-1.5 shadow-md transition cursor-pointer disabled:cursor-not-allowed"
              id="btn-apply-web-assist-result"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply & Save Translation</span>
            </button>
          </div>
        </div>
      </div>

      {/* Add Custom AI Site Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-stone-900 border border-stone-800 rounded-3xl p-5 shadow-2xl space-y-4 text-stone-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h5 className="font-semibold text-sm text-amber-200 flex items-center space-x-2">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Add Custom AI Web Site</span>
              </h5>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-200 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomSite} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-stone-300 font-medium">Site Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Poe AI, Mistral Le Chat, HuggingChat"
                  value={customSiteName}
                  onChange={(e) => setCustomSiteName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 placeholder-stone-500 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-stone-300 font-medium">Chat Web URL</label>
                <input
                  type="text"
                  required
                  placeholder="https://poe.com/ or https://chat.mistral.ai/"
                  value={customSiteUrl}
                  onChange={(e) => setCustomSiteUrl(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 placeholder-stone-500 focus:outline-hidden focus:ring-1 focus:ring-amber-400 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-stone-300 font-medium">Notes / Model details (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Claude 3 Opus or DeepSeek R1"
                  value={customSiteDescription}
                  onChange={(e) => setCustomSiteDescription(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 placeholder-stone-500 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-stone-400 hover:text-stone-200 text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!customSiteName.trim() || !customSiteUrl.trim()}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-stone-950 font-bold text-xs shadow-md transition cursor-pointer"
                >
                  Save AI Site
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
