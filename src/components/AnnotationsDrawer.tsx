import React, { useState } from 'react';
import { 
  X, 
  Trash2, 
  Bookmark, 
  Sparkles, 
  Copy, 
  Check, 
  Volume2,
  Search,
  ChevronDown,
  ChevronUp,
  Cpu,
  Clock,
  Layers,
  ChevronsUpDown,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Annotation } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AnnotationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  textTitle: string;
  annotations: Annotation[];
  onDeleteAnnotation: (id: string) => void;
}

interface TargetGroup {
  target: string;
  type: 'word' | 'passage';
  translations: Annotation[];
}

export const AnnotationsDrawer: React.FC<AnnotationsDrawerProps> = ({
  isOpen,
  onClose,
  textTitle,
  annotations,
  onDeleteAnnotation,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'word' | 'passage'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Section collapse states
  const [wordsSectionOpen, setWordsSectionOpen] = useState(true);
  const [passagesSectionOpen, setPassagesSectionOpen] = useState(true);
  
  // Set of target keys currently expanded by the user
  const [expandedTargetKeys, setExpandedTargetKeys] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Unknown date';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSpeak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Group annotations by target and type, sorted by latest date
  const groupAnnotations = (list: Annotation[]): TargetGroup[] => {
    const map = new Map<string, TargetGroup>();
    
    // Sort all by date descending (newest first)
    const sorted = [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    sorted.forEach((ann) => {
      const key = `${ann.type}:${ann.target.trim().toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          target: ann.target,
          type: ann.type,
          translations: [ann],
        });
      } else {
        map.get(key)!.translations.push(ann);
      }
    });

    return Array.from(map.values());
  };

  const filteredAnnotations = annotations.filter((ann) => {
    const matchesType = filterType === 'all' || ann.type === filterType;
    const matchesSearch = 
      ann.target.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ann.result.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ann.blueprintName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ann.modelUsed && ann.modelUsed.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const grouped = groupAnnotations(filteredAnnotations);
  const wordGroups = grouped.filter((g) => g.type === 'word');
  const passageGroups = grouped.filter((g) => g.type === 'passage');

  const toggleTargetExpanded = (key: string) => {
    setExpandedTargetKeys((prev) => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key], // default is open (undefined -> false to collapse)
    }));
  };

  const isTargetExpanded = (key: string) => {
    // By default, expanded if not explicitly collapsed
    return expandedTargetKeys[key] !== false;
  };

  const handleExpandAll = () => {
    const updated: Record<string, boolean> = {};
    grouped.forEach((g) => {
      const key = `${g.type}:${g.target.trim().toLowerCase()}`;
      updated[key] = true;
    });
    setExpandedTargetKeys(updated);
    setWordsSectionOpen(true);
    setPassagesSectionOpen(true);
  };

  const handleCollapseAll = () => {
    const updated: Record<string, boolean> = {};
    grouped.forEach((g) => {
      const key = `${g.type}:${g.target.trim().toLowerCase()}`;
      updated[key] = false;
    });
    setExpandedTargetKeys(updated);
  };

  const renderGroupCard = (group: TargetGroup) => {
    const key = `${group.type}:${group.target.trim().toLowerCase()}`;
    const expanded = isTargetExpanded(key);
    const latestTranslation = group.translations[0];
    const translationCount = group.translations.length;

    return (
      <div
        key={key}
        className="rounded-2xl bg-stone-950 border border-stone-800/90 overflow-hidden transition hover:border-amber-800/60 shadow-xs"
      >
        {/* Collapsible Card Header */}
        <div 
          onClick={() => toggleTargetExpanded(key)}
          className="p-3.5 flex items-center justify-between cursor-pointer select-none bg-stone-950 hover:bg-stone-900/60 transition gap-2"
        >
          <div className="flex items-center space-x-2.5 overflow-hidden flex-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
              group.type === 'word'
                ? 'bg-amber-900/60 text-amber-300 border border-amber-700/40'
                : 'bg-purple-900/60 text-purple-300 border border-purple-700/40'
            }`}>
              {group.type === 'word' ? 'Word' : 'Passage'}
            </span>

            <h4 dir="auto" className="text-sm font-serif font-semibold text-amber-200 truncate" style={{ unicodeBidi: 'plaintext' }}>
              "{group.target}"
            </h4>

            {translationCount > 1 && (
              <span className="inline-flex items-center space-x-1 text-[10px] bg-stone-800 text-stone-300 px-2 py-0.5 rounded-full border border-stone-700 font-sans shrink-0">
                <Layers className="w-2.5 h-2.5 text-amber-400" />
                <span>{translationCount} translations</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-[10px] text-stone-500 hidden sm:inline">
              {formatDate(latestTranslation.createdAt)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSpeak(group.target);
              }}
              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition"
              title="Pronounce target"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
            <div className="p-1 text-stone-400 hover:text-stone-200">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {/* Collapsible Content Body */}
        {expanded && (
          <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-stone-800/60 bg-stone-900/30">
            {group.translations.map((ann, idx) => (
              <div
                key={ann.id}
                className="p-3 rounded-xl bg-stone-900 border border-stone-800/80 space-y-2 relative"
              >
                {/* Translation metadata header */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs text-stone-400 border-b border-stone-800/70 pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-stone-800 text-amber-300 border border-stone-700">
                      {idx === 0 ? 'Latest Translation' : `Version ${idx + 1}`}
                    </span>
                    
                    {ann.modelUsed && (
                      <span className="inline-flex items-center space-x-1 text-[11px] font-mono text-stone-300">
                        <Cpu className="w-3 h-3 text-amber-400" />
                        <span>{ann.modelUsed}</span>
                      </span>
                    )}

                    <span className="text-[10px] text-stone-400">
                      ({ann.blueprintName})
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] text-stone-500 inline-flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-stone-500" />
                      <span>{formatDate(ann.createdAt)}</span>
                    </span>

                    <button
                      onClick={() => handleCopy(ann.id, ann.result)}
                      className="p-1 rounded-md hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition ml-1"
                      title="Copy this translation"
                    >
                      {copiedId === ann.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(`Delete this translation version (${formatDate(ann.createdAt)}) for "${ann.target}"?`)) {
                          onDeleteAnnotation(ann.id);
                        }
                      }}
                      className="p-1 rounded-md hover:bg-red-950 text-stone-500 hover:text-red-400 transition"
                      title="Delete this single translation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Translation Text with Math ($$) & Markdown Support */}
                <div className="text-xs text-stone-200 leading-relaxed font-sans">
                  <MarkdownRenderer content={ann.result} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs transition-opacity duration-300">
      <div className="flex-1 w-full" onClick={onClose} id="annotations-drawer-backdrop" />

      <div 
        className="w-full max-w-xl bg-stone-900 text-stone-100 h-full shadow-2xl flex flex-col border-l border-stone-800 animate-in slide-in-from-right duration-300"
        id="annotations-drawer-panel"
      >
        {/* Header */}
        <div className="p-4 border-b border-stone-800 flex items-center justify-between bg-stone-900">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-950 text-amber-400 border border-amber-800/60">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-serif font-semibold text-amber-100">
                Notes & Stored Translations
              </h3>
              <p className="text-xs text-stone-400 truncate max-w-[220px]">
                {textTitle}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition"
            id="btn-close-annotations-drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="p-3.5 border-b border-stone-800 space-y-2.5 bg-stone-900/80">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search words, passages, notes, models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-xs text-stone-200 placeholder-stone-500 focus:outline-hidden focus:border-amber-600"
              id="input-search-annotations"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  filterType === 'all'
                    ? 'bg-amber-800 text-amber-100 border border-amber-600'
                    : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                }`}
              >
                All ({annotations.length})
              </button>
              <button
                onClick={() => setFilterType('word')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  filterType === 'word'
                    ? 'bg-amber-900 text-amber-200 border border-amber-700'
                    : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                }`}
              >
                Words ({annotations.filter((a) => a.type === 'word').length})
              </button>
              <button
                onClick={() => setFilterType('passage')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  filterType === 'passage'
                    ? 'bg-purple-900 text-purple-200 border border-purple-700'
                    : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                }`}
              >
                Passages ({annotations.filter((a) => a.type === 'passage').length})
              </button>
            </div>

            {/* Collapse / Expand All controls */}
            <div className="flex items-center space-x-1 text-xs">
              <button
                onClick={handleExpandAll}
                className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-[11px] flex items-center space-x-1 transition"
                title="Expand all words and passages"
              >
                <Maximize2 className="w-3 h-3 text-amber-300" />
                <span className="hidden sm:inline">Expand All</span>
              </button>
              <button
                onClick={handleCollapseAll}
                className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-[11px] flex items-center space-x-1 transition"
                title="Collapse all words and passages"
              >
                <Minimize2 className="w-3 h-3 text-stone-400" />
                <span className="hidden sm:inline">Collapse All</span>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable List of Collapsible Annotations */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {grouped.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Bookmark className="w-8 h-8 text-stone-600 mx-auto" />
              <p className="text-sm font-medium text-stone-400">No notes or translations found</p>
              <p className="text-xs text-stone-500 max-w-xs mx-auto">
                Tap words or select text in the reader and save decipherments to build your personal lexicon.
              </p>
            </div>
          ) : (
            <>
              {/* Words Section */}
              {(filterType === 'all' || filterType === 'word') && wordGroups.length > 0 && (
                <div className="space-y-2.5">
                  <div 
                    onClick={() => setWordsSectionOpen(!wordsSectionOpen)}
                    className="flex items-center justify-between py-1.5 px-2 rounded-xl bg-stone-950/80 border border-stone-800/80 cursor-pointer select-none text-xs font-semibold text-amber-200"
                  >
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Words & Etymologies ({wordGroups.length})</span>
                    </div>
                    <div className="text-stone-400">
                      {wordsSectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>

                  {wordsSectionOpen && (
                    <div className="space-y-3 pl-1">
                      {wordGroups.map(renderGroupCard)}
                    </div>
                  )}
                </div>
              )}

              {/* Passages Section */}
              {(filterType === 'all' || filterType === 'passage') && passageGroups.length > 0 && (
                <div className="space-y-2.5">
                  <div 
                    onClick={() => setPassagesSectionOpen(!passagesSectionOpen)}
                    className="flex items-center justify-between py-1.5 px-2 rounded-xl bg-stone-950/80 border border-stone-800/80 cursor-pointer select-none text-xs font-semibold text-purple-200"
                  >
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>Phrases & Passages ({passageGroups.length})</span>
                    </div>
                    <div className="text-stone-400">
                      {passagesSectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>

                  {passagesSectionOpen && (
                    <div className="space-y-3 pl-1">
                      {passageGroups.map(renderGroupCard)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
