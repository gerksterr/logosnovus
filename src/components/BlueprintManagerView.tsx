import React, { useState } from 'react';
import { 
  Sparkles, 
  Plus, 
  Trash2, 
  Edit3, 
  Copy, 
  Check, 
  FileText, 
  X, 
  AlertCircle,
  Play,
  RotateCcw
} from 'lucide-react';
import { QueryBlueprint, BlueprintType, LLMConfig } from '../types';
import { executeLLMQuery, buildQueryPrompt } from '../services/llmService';

interface BlueprintManagerViewProps {
  blueprints: QueryBlueprint[];
  onSaveBlueprint: (bp: QueryBlueprint) => void;
  onDeleteBlueprint: (id: string) => void;
  llmConfig: LLMConfig;
}

export const BlueprintManagerView: React.FC<BlueprintManagerViewProps> = ({
  blueprints,
  onSaveBlueprint,
  onDeleteBlueprint,
  llmConfig,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'word' | 'passage'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBp, setEditingBp] = useState<QueryBlueprint | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState<BlueprintType>('word');
  const [template, setTemplate] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // Test prompt state
  const [testTarget, setTestTarget] = useState('Nutzwert');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const filtered = blueprints.filter((b) => filterType === 'all' || b.type === filterType);

  const handleOpenCreate = () => {
    setEditingBp(null);
    setName('');
    setType('word');
    setTemplate('Very brief composite construction, etymology and historical development of the (Biblical-) German word: {word} in/until the early 20th century.');
    setDescription('');
    setIsDefault(false);
    setTestTarget('Nutzwert');
    setTestResult(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (bp: QueryBlueprint) => {
    setEditingBp(bp);
    setName(bp.name);
    setType(bp.type);
    setTemplate(bp.template);
    setDescription(bp.description || '');
    setIsDefault(Boolean(bp.isDefault));
    setTestTarget(bp.type === 'word' ? 'Nutzwert' : 'Er führt mich hinab in die dunklen Höhlen des Unbewussten.');
    setTestResult(null);
    setIsModalOpen(true);
  };

  const handleClone = (bp: QueryBlueprint) => {
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

  const handleRunTest = async () => {
    if (!template.trim() || !testTarget.trim()) return;

    setIsTesting(true);
    setTestResult(null);

    const prompt = buildQueryPrompt(template, testTarget, type);
    const res = await executeLLMQuery(prompt, llmConfig);

    setIsTesting(false);
    if (res.error) {
      setTestResult(`Test Error: ${res.error}`);
    } else {
      setTestResult(res.text);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !template.trim()) return;

    // Check placeholder
    const requiredPlaceholder = type === 'word' ? '{word}' : '{text}';
    if (!template.includes(requiredPlaceholder)) {
      alert(`The prompt template for ${type} query MUST contain the placeholder ${requiredPlaceholder}`);
      return;
    }

    const newBp: QueryBlueprint = {
      id: editingBp ? editingBp.id : `bp-${Date.now()}`,
      name: name.trim(),
      type,
      template: template.trim(),
      description: description.trim() || undefined,
      isDefault,
      createdAt: editingBp ? editingBp.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveBlueprint(newBp);
    setIsModalOpen(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-24 space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-4">
        <div>
          <h2 className="text-xl font-serif font-bold text-amber-100 flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span>Query Blueprint Manager</span>
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">
            Create, customize, and recall reusable prompt blueprints for words ({'{word}'}) and passages ({'{text}'}).
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-amber-50 text-xs font-medium flex items-center justify-center space-x-2 shadow-md transition"
          id="btn-create-blueprint"
        >
          <Plus className="w-4 h-4" />
          <span>New Query Blueprint</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2 border-b border-stone-800/80 pb-3">
        <button
          onClick={() => setFilterType('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition ${
            filterType === 'all'
              ? 'bg-amber-800 text-amber-100 border border-amber-600'
              : 'bg-stone-800/80 text-stone-400 hover:text-stone-200'
          }`}
          id="tab-filter-all-blueprints"
        >
          All ({blueprints.length})
        </button>

        <button
          onClick={() => setFilterType('word')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition ${
            filterType === 'word'
              ? 'bg-amber-900 text-amber-200 border border-amber-700'
              : 'bg-stone-800/80 text-stone-400 hover:text-stone-200'
          }`}
          id="tab-filter-word-blueprints"
        >
          Word Queries ({blueprints.filter((b) => b.type === 'word').length})
        </button>

        <button
          onClick={() => setFilterType('passage')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition ${
            filterType === 'passage'
              ? 'bg-purple-900 text-purple-200 border border-purple-700'
              : 'bg-stone-800/80 text-stone-400 hover:text-stone-200'
          }`}
          id="tab-filter-passage-blueprints"
        >
          Passage Queries ({blueprints.filter((b) => b.type === 'passage').length})
        </button>
      </div>

      {/* Blueprint Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((bp) => (
          <div
            key={bp.id}
            className="p-4 rounded-2xl bg-stone-900 border border-stone-800/90 shadow-md space-y-3 relative group hover:border-amber-800/60 transition flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      bp.type === 'word'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                        : 'bg-purple-950 text-purple-300 border border-purple-800/60'
                    }`}>
                      {bp.type === 'word' ? 'Word ({word})' : 'Passage ({text})'}
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
                    onClick={() => handleOpenEdit(bp)}
                    className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-amber-300 transition"
                    title="Edit Blueprint"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleClone(bp)}
                    className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition"
                    title="Duplicate Blueprint"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteBlueprint(bp.id)}
                    className="p-1.5 rounded-lg hover:bg-red-950 text-stone-500 hover:text-red-400 transition"
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

              {/* Template Text box */}
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

      {/* Editor Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto"
        >
          <div 
            className="w-full max-w-xl bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl text-stone-100 flex flex-col max-h-[90vh] overflow-hidden my-auto animate-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
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
                    Define custom LLM prompt instructions with placeholder variables
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs font-sans">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-amber-200 font-medium">Blueprint Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jungian Symbolic Exegesis"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 placeholder-stone-600 focus:outline-hidden focus:border-amber-600 text-xs"
                    id="input-blueprint-name"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-amber-200 font-medium">Query Type *</label>
                  <select
                    value={type}
                    onChange={(e) => {
                      const newType = e.target.value as BlueprintType;
                      setType(newType);
                      if (newType === 'word' && !template.includes('{word}')) {
                        setTemplate((prev) => prev + ' {word}');
                        setTestTarget('Nutzwert');
                      } else if (newType === 'passage' && !template.includes('{text}')) {
                        setTemplate((prev) => prev + " '{text}'");
                        setTestTarget('Er führt mich hinab in die dunklen Höhlen des Unbewussten.');
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 focus:outline-hidden focus:border-amber-600 text-xs"
                    id="select-blueprint-type"
                  >
                    <option value="word">Word Query (Uses {'{word}'})</option>
                    <option value="passage">Passage Query (Uses {'{text}'})</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-stone-300 font-medium">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Focuses on Carl Jung's Red Book contemporary symbolic meanings"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 placeholder-stone-600 focus:outline-hidden focus:border-amber-600 text-xs"
                  id="input-blueprint-description"
                />
              </div>

              {/* Template Editor */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-amber-200 font-medium">
                    LLM Prompt Template *
                  </label>
                  <span className="text-[11px] font-mono text-amber-400">
                    Must include {type === 'word' ? '{word}' : '{text}'}
                  </span>
                </div>

                <textarea
                  required
                  rows={4}
                  placeholder={
                    type === 'word'
                      ? 'e.g. Very brief composite construction, etymology and historical development of the (Biblical-) German word: {word} in/until the early 20th century.'
                      : "e.g. Shed light on the -strictly symbolic- contemporary meanings of the original piece of text '{text}' from Carl Jung's Red Book..."
                  }
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="w-full p-3 rounded-xl bg-stone-950 border border-stone-800 text-amber-200 placeholder-stone-600 focus:outline-hidden focus:border-amber-600 text-xs font-mono leading-relaxed"
                  id="textarea-blueprint-template"
                />
              </div>

              {/* Default Toggle */}
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="checkbox-is-default"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="w-4 h-4 rounded-sm border-stone-700 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="checkbox-is-default" className="text-xs text-stone-300 cursor-pointer">
                  Set as default query blueprint for new {type}s
                </label>
              </div>

              {/* Interactive Tester */}
              <div className="p-3.5 rounded-2xl bg-stone-950 border border-stone-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-medium text-amber-300">
                  <span className="flex items-center space-x-1.5">
                    <Play className="w-3.5 h-3.5" />
                    <span>Test Prompt with Live LLM</span>
                  </span>
                  <span className="text-[10px] text-stone-400">
                    Provider: {llmConfig.provider}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={testTarget}
                    onChange={(e) => setTestTarget(e.target.value)}
                    placeholder={`Sample ${type}...`}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-stone-900 border border-stone-800 text-xs text-stone-200"
                    id="input-test-target"
                  />
                  <button
                    type="button"
                    onClick={handleRunTest}
                    disabled={isTesting}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-800 hover:bg-amber-700 text-amber-100 text-xs font-medium flex items-center space-x-1 transition disabled:opacity-50"
                    id="btn-run-blueprint-test"
                  >
                    {isTesting ? (
                      <span className="animate-pulse">Testing...</span>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        <span>Run Test</span>
                      </>
                    )}
                  </button>
                </div>

                {testResult && (
                  <div className="p-3 rounded-xl bg-stone-900 border border-stone-800 text-[11px] text-stone-200 font-sans leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
                    {testResult}
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-stone-800 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-amber-50 text-xs font-medium flex items-center space-x-1.5 shadow-md"
                  id="btn-save-blueprint-item"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Blueprint</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
