import React, { useState } from 'react';
import { 
  Layers, 
  Plus, 
  Trash2, 
  Edit3, 
  Copy, 
  Globe, 
  X 
} from 'lucide-react';
import { CalquePromptTemplate, LanguageItem } from '../../types';
import { saveCalquePrompt, deleteCalquePrompt } from '../../services/storageService';

interface CalquePromptsTabProps {
  calquePrompts: CalquePromptTemplate[];
  setCalquePrompts: (prompts: CalquePromptTemplate[]) => void;
  languages: LanguageItem[];
}

export const CalquePromptsTab: React.FC<CalquePromptsTabProps> = ({
  calquePrompts,
  setCalquePrompts,
  languages,
}) => {
  const [isCalqueModalOpen, setIsCalqueModalOpen] = useState(false);
  const [editingCalque, setEditingCalque] = useState<CalquePromptTemplate | null>(null);
  const [calqueTitle, setCalqueTitle] = useState('');
  const [calqueDescription, setCalqueDescription] = useState('');
  const [calqueLanguage, setCalqueLanguage] = useState('all');
  const [calquePrompt, setCalquePrompt] = useState('');

  const handleOpenCreateCalque = () => {
    setEditingCalque(null);
    setCalqueTitle('');
    setCalqueDescription('');
    setCalqueLanguage('all');
    setCalquePrompt(
      `You are an expert philological translator specializing in etymological calques and 1:1 mirror alignment.\n\nTranslate the following passage word-for-word, preserving the strict word order and etymological root semantics into English.`
    );
    setIsCalqueModalOpen(true);
  };

  const handleOpenEditCalque = (calque: CalquePromptTemplate) => {
    setEditingCalque(calque);
    setCalqueTitle(calque.title);
    setCalqueDescription(calque.description || '');
    setCalqueLanguage(calque.language || 'all');
    setCalquePrompt(calque.prompt);
    setIsCalqueModalOpen(true);
  };

  const handleCloneCalque = (calque: CalquePromptTemplate) => {
    const cloned: CalquePromptTemplate = {
      ...calque,
      id: `calque-${Date.now()}`,
      title: `${calque.title} (Copy)`,
      createdAt: new Date().toISOString(),
    };
    const updated = saveCalquePrompt(cloned);
    setCalquePrompts(updated);
  };

  const handleSaveCalqueForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!calqueTitle.trim() || !calquePrompt.trim()) return;

    const item: CalquePromptTemplate = {
      id: editingCalque ? editingCalque.id : `calque-${Date.now()}`,
      title: calqueTitle.trim(),
      description: calqueDescription.trim() || undefined,
      language: calqueLanguage,
      prompt: calquePrompt.trim(),
      createdAt: editingCalque ? editingCalque.createdAt : new Date().toISOString(),
    };

    const updated = saveCalquePrompt(item);
    setCalquePrompts(updated);
    setIsCalqueModalOpen(false);
  };

  const handleDeleteCalqueItem = (id: string) => {
    if (confirm('Delete this Mirror / Calque Blueprint?')) {
      const updated = deleteCalquePrompt(id);
      setCalquePrompts(updated);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-900/50 p-3 rounded-2xl border border-stone-800">
        <div className="flex items-center space-x-2 text-xs text-emerald-200">
          <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Mirror Translation & Calque Prompt Templates ({calquePrompts.length})</span>
        </div>
        <button
          onClick={handleOpenCreateCalque}
          className="px-3.5 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-emerald-50 text-xs font-semibold flex items-center space-x-1.5 shadow-md transition cursor-pointer"
          id="btn-create-calque-tab"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Mirror Blueprint</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {calquePrompts.map((calque) => (
          <div
            key={calque.id}
            className="p-4 rounded-2xl bg-stone-900 border border-stone-800/90 shadow-md space-y-3 relative group hover:border-emerald-800/60 transition flex flex-col justify-between"
          >
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                      Calque
                    </span>
                    <span className="text-[10px] bg-stone-800 text-stone-300 px-2 py-0.5 rounded-full border border-stone-700">
                      {calque.language && calque.language !== 'all' ? calque.language : 'All Languages'}
                    </span>
                  </div>

                  <h3 className="text-base font-serif font-semibold text-emerald-100 mt-1.5">
                    {calque.title}
                  </h3>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleCloneCalque(calque)}
                    className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition cursor-pointer"
                    title="Duplicate Calque"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleOpenEditCalque(calque)}
                    className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-emerald-300 transition cursor-pointer"
                    title="Edit Calque Blueprint"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteCalqueItem(calque.id)}
                    className="p-1.5 rounded-lg hover:bg-red-950 text-stone-500 hover:text-red-400 transition cursor-pointer"
                    title="Delete Calque Blueprint"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {calque.description && (
                <p className="text-xs text-stone-400 italic">
                  {calque.description}
                </p>
              )}

              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800/80 font-mono text-xs text-emerald-200/90 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap">
                {calque.prompt}
              </div>
            </div>

            <div className="pt-2 text-[10px] text-stone-500 border-t border-stone-800/60 flex justify-between items-center">
              <span>Target Variable: {'{text}'}</span>
              <span>{new Date(calque.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Calque Modal */}
      {isCalqueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-xl bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl text-stone-100 flex flex-col max-h-[90vh] overflow-hidden my-auto animate-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-5 border-b border-stone-800 flex items-center justify-between bg-stone-900">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-serif font-semibold text-emerald-100">
                    {editingCalque ? 'Edit Mirror Blueprint' : 'Create Mirror Blueprint'}
                  </h3>
                  <p className="text-xs text-stone-400">
                    Configure prompt rules and instructions for mirror calque translations
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsCalqueModalOpen(false)}
                className="p-2 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCalqueForm} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs font-sans">
              <div className="space-y-1.5">
                <label className="text-stone-300 font-medium">Blueprint Title *</label>
                <input
                  type="text"
                  required
                  value={calqueTitle}
                  onChange={(e) => setCalqueTitle(e.target.value)}
                  placeholder="e.g. Standard Historical Calque"
                  className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-stone-300 font-medium">Applicable Language</label>
                <select
                  value={calqueLanguage}
                  onChange={(e) => setCalqueLanguage(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-emerald-200 focus:outline-none focus:border-emerald-600 cursor-pointer"
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
                  value={calqueDescription}
                  onChange={(e) => setCalqueDescription(e.target.value)}
                  placeholder="e.g. Preserves archaic Germanic morphological composition"
                  className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-stone-300 font-medium">Calque Prompt Template *</label>
                <textarea
                  rows={5}
                  required
                  value={calquePrompt}
                  onChange={(e) => setCalquePrompt(e.target.value)}
                  className="w-full p-3 rounded-xl bg-stone-950 border border-stone-800 text-emerald-200 font-mono text-xs focus:outline-none focus:border-emerald-600 leading-relaxed"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsCalqueModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-emerald-50 font-semibold shadow-md transition cursor-pointer"
                >
                  Save Mirror Blueprint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
