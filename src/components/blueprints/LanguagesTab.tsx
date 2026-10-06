import React, { useState } from 'react';
import { 
  Languages, 
  Plus, 
  Trash2, 
  Edit3, 
  X 
} from 'lucide-react';
import { LanguageItem } from '../../types';
import { saveLanguageItem, deleteLanguageItem } from '../../services/storageService';

interface LanguagesTabProps {
  languages: LanguageItem[];
  setLanguages: (languages: LanguageItem[]) => void;
  onRefreshLanguages?: () => void;
}

export const LanguagesTab: React.FC<LanguagesTabProps> = ({
  languages,
  setLanguages,
  onRefreshLanguages,
}) => {
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [editingLang, setEditingLang] = useState<LanguageItem | null>(null);
  const [langName, setLangName] = useState('');
  const [langCode, setLangCode] = useState('');
  const [langIsRTL, setLangIsRTL] = useState(false);
  const [langDescription, setLangDescription] = useState('');

  const handleOpenCreateLang = () => {
    setEditingLang(null);
    setLangName('');
    setLangCode('');
    setLangIsRTL(false);
    setLangDescription('');
    setIsLangModalOpen(true);
  };

  const handleOpenEditLang = (lang: LanguageItem) => {
    setEditingLang(lang);
    setLangName(lang.name);
    setLangCode(lang.code || '');
    setLangIsRTL(Boolean(lang.isRTL));
    setLangDescription(lang.description || '');
    setIsLangModalOpen(true);
  };

  const handleSaveLangForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!langName.trim()) return;

    const item: LanguageItem = {
      id: editingLang ? editingLang.id : `lang-${Date.now()}`,
      name: langName.trim(),
      code: langCode.trim() || undefined,
      isRTL: langIsRTL,
      description: langDescription.trim() || undefined,
      isCustom: editingLang ? editingLang.isCustom : true,
      createdAt: editingLang ? editingLang.createdAt : new Date().toISOString(),
    };

    const updated = saveLanguageItem(item);
    setLanguages(updated);
    if (onRefreshLanguages) onRefreshLanguages();
    setIsLangModalOpen(false);
  };

  const handleDeleteLangItem = (id: string) => {
    if (confirm('Delete this language specification?')) {
      const updated = deleteLanguageItem(id);
      setLanguages(updated);
      if (onRefreshLanguages) onRefreshLanguages();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-900/50 p-3 rounded-2xl border border-stone-800">
        <div className="flex items-center space-x-2 text-xs text-indigo-200">
          <Languages className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>Dynamic Language Registry with RTL script direction support ({languages.length})</span>
        </div>
        <button
          onClick={handleOpenCreateLang}
          className="px-3.5 py-1.5 rounded-xl bg-indigo-800 hover:bg-indigo-700 text-indigo-50 text-xs font-semibold flex items-center space-x-1.5 shadow-md transition cursor-pointer"
          id="btn-add-language-tab"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Custom Language</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {languages.map((lang) => (
          <div
            key={lang.id}
            className="p-4 rounded-2xl bg-stone-900 border border-stone-800 shadow-md space-y-2.5 hover:border-indigo-800/60 transition"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-base font-serif font-bold text-indigo-100">{lang.name}</span>
                  {lang.isRTL && (
                    <span className="text-[10px] bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800/60">
                      RTL
                    </span>
                  )}
                </div>
                {lang.code && <span className="text-[10px] text-stone-500 font-mono">Code: {lang.code}</span>}
              </div>

              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handleOpenEditLang(lang)}
                  className="p-1 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-indigo-300 transition cursor-pointer"
                  title="Edit Language"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                {lang.isCustom && (
                  <button
                    onClick={() => handleDeleteLangItem(lang.id)}
                    className="p-1 rounded-lg hover:bg-red-950 text-stone-500 hover:text-red-400 transition cursor-pointer"
                    title="Delete Language"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {lang.description && (
              <p className="text-xs text-stone-400 italic line-clamp-2">
                {lang.description}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Language Modal */}
      {isLangModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-md bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl text-stone-100 flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-5 border-b border-stone-800 flex items-center justify-between bg-stone-900">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                  <Languages className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-serif font-semibold text-indigo-100">
                    {editingLang ? 'Edit Language' : 'Add Custom Language'}
                  </h3>
                  <p className="text-xs text-stone-400">
                    Register a new language specification for texts and blueprints
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsLangModalOpen(false)}
                className="p-2 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLangForm} className="p-4 sm:p-6 space-y-4 text-xs font-sans">
              <div className="space-y-1.5">
                <label className="text-stone-300 font-medium">Language Name *</label>
                <input
                  type="text"
                  required
                  value={langName}
                  onChange={(e) => setLangName(e.target.value)}
                  placeholder="e.g. Coptic, Old English, Pali"
                  className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-stone-300 font-medium">Language Code (Optional)</label>
                <input
                  type="text"
                  value={langCode}
                  onChange={(e) => setLangCode(e.target.value)}
                  placeholder="e.g. cop, ang, pli"
                  className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 font-mono focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="lang-isRTL"
                  checked={langIsRTL}
                  onChange={(e) => setLangIsRTL(e.target.checked)}
                  className="w-4 h-4 rounded bg-stone-950 border-stone-800 text-indigo-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="lang-isRTL" className="text-stone-300 cursor-pointer select-none">
                  Right-to-Left (RTL) Script (e.g. Hebrew, Arabic, Aramaic)
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="text-stone-300 font-medium">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={langDescription}
                  onChange={(e) => setLangDescription(e.target.value)}
                  placeholder="e.g. Philological manuscripts and biblical commentaries."
                  className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-200 text-xs focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsLangModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-800 hover:bg-indigo-700 text-indigo-50 font-semibold shadow-md transition cursor-pointer"
                >
                  Save Language
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
