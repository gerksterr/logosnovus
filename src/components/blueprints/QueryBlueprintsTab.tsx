import React, { useState } from 'react';
import { 
  Sparkles, 
  Plus, 
  Trash2, 
  Edit3, 
  Copy, 
  Globe, 
  Search, 
  RefreshCw, 
  Play, 
  X 
} from 'lucide-react';
import { QueryBlueprint, BlueprintType, LanguageItem, LLMConfig } from '../../types';
import { executeLLMQuery, buildQueryPrompt } from '../../services/llmService';

interface QueryBlueprintsTabProps {
  blueprints: QueryBlueprint[];
  languages: LanguageItem[];
  onSaveBlueprint: (bp: QueryBlueprint) => void;
  onDeleteBlueprint: (id: string) => void;
  llmConfig: LLMConfig;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const QueryBlueprintsTab: React.FC<QueryBlueprintsTabProps> = ({
  blueprints,
  languages,
  onSaveBlueprint,
  onDeleteBlueprint,
  llmConfig,
  searchQuery,
  setSearchQuery,
}) => {
  const [queryFilterType, setQueryFilterType] = useState<'all' | 'word' | 'passage'>('all');
  const [queryFilterLang, setQueryFilterLang] = useState<string>('all');
  const [isQueryModalOpen, setIsQueryModalOpen] = useState(false);
  const [editingBp, setEditingBp] = useState<QueryBlueprint | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState<BlueprintType>('word');
  const [template, setTemplate] = useState('');
  const [description, setDescription] = useState('');
  const [blueprintLanguage, setBlueprintLanguage] = useState('all');
  const [isDefault, setIsDefault] = useState(false);

  // Test prompt state
  const [testTarget, setTestTarget] = useState('Nutzwert');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleOpenCreateQuery = () => {
    setEditingBp(null);
    setName('');
    setType('word');
    setTemplate('Very brief composite construction, etymology and historical development of the (Biblical-) German word: {word} in/until the early 20th century.');
    setDescription('');
    setBlueprintLanguage('all');
    setIsDefault(false);
    setTestResult(null);
    setIsQueryModalOpen(true);
  };

  const handleOpenEditQuery = (bp: QueryBlueprint) => {
    setEditingBp(bp);
    setName(bp.name);
    setType(bp.type);
    setTemplate(bp.template);
    setDescription(bp.description || '');
    setBlueprintLanguage(bp.language || 'all');
    setIsDefault(Boolean(bp.isDefault));
    setTestResult(null);
    setIsQueryModalOpen(true);
  };

  const handleCloneQuery = (bp: QueryBlueprint) => {
    const cloned: QueryBlueprint = {
      ...bp,
      id: `bp-${Date.now()}`,
      name: `${bp.name} (Copy)`,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSaveBlueprint(cloned);
  };

  const handleSaveQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !template.trim()) return;

    const bp: QueryBlueprint = {
      id: editingBp ? editingBp.id : `bp-${Date.now()}`,
      name: name.trim(),
      type,
      template: template.trim(),
      description: description.trim() || undefined,
      language: blueprintLanguage,
      isDefault,
      createdAt: editingBp ? editingBp.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveBlueprint(bp);
    setIsQueryModalOpen(false);
  };

  const handleRunQueryTest = async () => {
    if (!testTarget.trim() || !template.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const prompt = buildQueryPrompt(template, testTarget, type);
      const res = await executeLLMQuery(prompt, llmConfig);
      setTestResult(res.text || 'No response generated.');
    } catch (err: any) {
      setTestResult(`Error: ${err.message || 'Failed to execute query'}`);
    } finally {
      setIsTesting(false);
    }
  };

  const filteredQueries = blueprints.filter((b) => {
    const matchesType = queryFilterType === 'all' || b.type === queryFilterType;
    const matchesLang = queryFilterLang === 'all' || !b.language || b.language === 'all' || b.language === queryFilterLang;
    const matchesSearch = !searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase()) || b.template.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesLang && matchesSearch;
  });

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-900/50 p-3 rounded-2xl border border-stone-800">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1 bg-stone-950 p-1 rounded-xl border border-stone-800">
            <button
              onClick={() => setQueryFilterType('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                queryFilterType === 'all' ? 'bg-amber-800 text-amber-100' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => setQueryFilterType('word')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                queryFilterType === 'word' ? 'bg-amber-900 text-amber-200' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Word
            </button>
            <button
              onClick={() => setQueryFilterType('passage')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                queryFilterType === 'passage' ? 'bg-purple-900 text-purple-200' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Passage
            </button>
          </div>

          {/* Language Filter */}
          <div className="flex items-center space-x-1.5 bg-stone-950 px-3 py-1.5 rounded-xl border border-stone-800 text-xs">
            <Globe className="w-3.5 h-3.5 text-stone-400" />
            <span className="text-stone-400">Language:</span>
            <select
              value={queryFilterLang}
              onChange={(e) => setQueryFilterLang(e.target.value)}
              className="bg-transparent text-amber-200 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-stone-900 text-stone-200">All Languages</option>
              {languages.map((l) => (
                <option key={l.id} value={l.name} className="bg-stone-900 text-stone-200">
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search & New */}
        <div className="flex items-center space-x-2">
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="text"
              placeholder="Search blueprints..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-xs text-stone-200 focus:outline-none focus:border-amber-600"
            />
          </div>
          <button
            onClick={handleOpenCreateQuery}
            className="px-3 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-600 text-amber-50 text-xs font-semibold flex items-center space-x-1.5 shadow-md transition cursor-pointer"
            id="btn-create-query-tab"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Blueprint</span>
          </button>
        </div>
      </div>

      {/* Blueprint Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredQueries.map((bp) => (
          <div
            key={bp.id}
            className="p-4 rounded-2xl bg-stone-900 border border-stone-800/90 shadow-md space-y-3 relative group hover:border-amber-800/60 transition flex flex-col justify-between"
          >
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      bp.type === 'word'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                        : 'bg-purple-950 text-purple-300 border border-purple-800/60'
                    }`}>
                      {bp.type === 'word' ? 'Word' : 'Passage'}
                    </span>

                    <span className="text-[10px] bg-stone-800 text-stone-300 px-2 py-0.5 rounded-full border border-stone-700 flex items-center space-x-1">
                      <Globe className="w-2.5 h-2.5 text-stone-400" />
                      <span>{bp.language && bp.language !== 'all' ? bp.language : 'All Languages'}</span>
                    </span>

                    {bp.isDefault && (
                      <span className="text-[10px] bg-stone-800 text-amber-300 px-2 py-0.5 rounded-full border border-stone-700">
                        Default
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-serif font-semibold text-amber-100 mt-1.5">
                    {bp.name}
                  </h3>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleOpenEditQuery(bp)}
                    className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-amber-300 transition cursor-pointer"
                    title="Edit Blueprint"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleCloneQuery(bp)}
                    className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition cursor-pointer"
                    title="Duplicate Blueprint"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteBlueprint(bp.id)}
                    className="p-1.5 rounded-lg hover:bg-red-950 text-stone-500 hover:text-red-400 transition cursor-pointer"
                    title="Delete Blueprint"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {bp.description && (
                <p className="text-xs text-stone-400 italic">
                  {bp.description}
                </p>
              )}

              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800/80 font-mono text-xs text-amber-200/90 leading-relaxed whitespace-pre-wrap">
                {bp.template}
              </div>
            </div>

            <div className="pt-2 text-[10px] text-stone-500 border-t border-stone-800/60 flex justify-between items-center">
              <span>Variables: {bp.type === 'word' ? '{word}' : '{text}'}</span>
              <span>Updated {new Date(bp.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Query Blueprint Modal */}
      {isQueryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-xl bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl text-stone-100 flex flex-col max-h-[90vh] overflow-hidden my-auto animate-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-5 border-b border-stone-800 flex items-center justify-between bg-stone-900">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-amber-950 text-amber-400 border border-amber-800/60">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-serif font-semibold text-amber-100">
                    {editingBp ? 'Edit Query Blueprint' : 'Create New Query Blueprint'}
                  </h3>
                  <p className="text-xs text-stone-400">
                    Configure prompt templates and language filters for word and passage queries
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsQueryModalOpen(false)}
                className="p-2 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuery} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs font-sans">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-stone-300 font-medium">Blueprint Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Historical German Roots"
                    className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 focus:outline-none focus:border-amber-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-stone-300 font-medium">Query Type *</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as BlueprintType)}
                    className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 focus:outline-none focus:border-amber-600"
                  >
                    <option value="word">Word Deciphering (Variable: {'{word}'})</option>
                    <option value="passage">Passage Interpretation (Variable: {'{text}'})</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-stone-300 font-medium">Applicable Language</label>
                <select
                  value={blueprintLanguage}
                  onChange={(e) => setBlueprintLanguage(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-amber-200 focus:outline-none focus:border-amber-600"
                >
                  <option value="all">All Languages</option>
                  {languages.map((l) => (
                    <option key={l.id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-stone-300 font-medium">Short Description (Optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Rigorous etymological decomposition of early German roots"
                  className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 focus:outline-none focus:border-amber-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-stone-300 font-medium">
                  Prompt Template * (Must include {type === 'word' ? '{word}' : '{text}'})
                </label>
                <textarea
                  rows={4}
                  required
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="w-full p-3 rounded-xl bg-stone-950 border border-stone-800 text-amber-200 font-mono text-xs focus:outline-none focus:border-amber-600 leading-relaxed"
                />
              </div>

              {/* Live Test */}
              <div className="p-3.5 rounded-2xl bg-stone-950 border border-stone-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-300">Live Blueprint Test</span>
                  <button
                    type="button"
                    onClick={handleRunQueryTest}
                    disabled={isTesting}
                    className="px-3 py-1 rounded-lg bg-amber-800 hover:bg-amber-700 text-amber-100 text-[11px] font-medium flex items-center space-x-1.5 transition disabled:opacity-50 cursor-pointer"
                  >
                    {isTesting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    <span>{isTesting ? 'Testing...' : 'Run Test'}</span>
                  </button>
                </div>

                <input
                  type="text"
                  value={testTarget}
                  onChange={(e) => setTestTarget(e.target.value)}
                  placeholder={type === 'word' ? 'Sample test word' : 'Sample test sentence'}
                  className="w-full p-2 rounded-xl bg-stone-900 border border-stone-800 text-xs text-stone-200 focus:outline-none focus:border-amber-600"
                />

                {testResult && (
                  <div className="p-3 rounded-xl bg-stone-900/90 border border-stone-800 font-sans text-xs text-stone-300 max-h-36 overflow-y-auto whitespace-pre-wrap">
                    {testResult}
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsQueryModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-amber-50 font-semibold shadow-md transition cursor-pointer"
                >
                  Save Blueprint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
