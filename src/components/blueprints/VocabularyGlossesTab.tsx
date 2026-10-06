import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  RotateCcw, 
  X 
} from 'lucide-react';
import { LanguageWordGloss, LanguageItem } from '../../types';
import { 
  getLanguageGlossesForLanguage,
  saveLanguageWordGloss,
  deleteLanguageWordGloss,
  applyLanguageGlossDictionaryToAllTexts,
  getStoredTexts
} from '../../services/storageService';

interface VocabularyGlossesTabProps {
  languages: LanguageItem[];
}

export const VocabularyGlossesTab: React.FC<VocabularyGlossesTabProps> = ({ languages }) => {
  const [selectedVocabLang, setSelectedVocabLang] = useState<string>(
    languages[0]?.name || 'German'
  );
  const [vocabGlosses, setVocabGlosses] = useState<LanguageWordGloss[]>([]);
  const [vocabSearch, setVocabSearch] = useState('');
  const [isVocabModalOpen, setIsVocabModalOpen] = useState(false);
  const [editingGloss, setEditingGloss] = useState<LanguageWordGloss | null>(null);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedVocabLang) {
      setVocabGlosses(getLanguageGlossesForLanguage(selectedVocabLang));
    }
  }, [selectedVocabLang]);

  const handleOpenCreateGloss = () => {
    setEditingGloss(null);
    setIsVocabModalOpen(true);
  };

  const handleOpenEditGloss = (gloss: LanguageWordGloss) => {
    setEditingGloss(gloss);
    setIsVocabModalOpen(true);
  };

  const handleSaveGlossForm = (e: React.FormEvent) => {
    e.preventDefault();
    const origInput = (document.getElementById('gloss-orig') as HTMLInputElement)?.value.trim();
    const transInput = (document.getElementById('gloss-trans') as HTMLInputElement)?.value.trim();
    const compoundInput = (document.getElementById('gloss-compound') as HTMLInputElement)?.value.trim();
    const keepOrigInput = (document.getElementById('gloss-keepOrig') as HTMLInputElement)?.checked;

    if (!origInput || !transInput) return;

    const gloss: LanguageWordGloss = {
      cleanOrig: origInput.toLowerCase(),
      orig: origInput,
      trans: transInput,
      compoundMeaning: compoundInput || undefined,
      keepOrig: keepOrigInput,
      language: selectedVocabLang,
      updatedAt: new Date().toISOString(),
    };

    saveLanguageWordGloss(gloss);
    setVocabGlosses(getLanguageGlossesForLanguage(selectedVocabLang));
    setIsVocabModalOpen(false);
  };

  const handleDeleteGloss = (cleanOrig: string) => {
    if (confirm(`Remove persistent gloss for "${cleanOrig}"?`)) {
      deleteLanguageWordGloss(selectedVocabLang, cleanOrig);
      setVocabGlosses(getLanguageGlossesForLanguage(selectedVocabLang));
    }
  };

  const handleApplyDictionaryToAllTexts = () => {
    const allTexts = getStoredTexts();
    const matchingTexts = allTexts.filter(
      (t) => (t.language || 'German').toLowerCase() === selectedVocabLang.toLowerCase()
    );

    if (matchingTexts.length === 0) {
      setSyncStatusMessage(`No library texts found with language: ${selectedVocabLang}`);
      setTimeout(() => setSyncStatusMessage(null), 4000);
      return;
    }

    const { updatedTextsCount, updatedWordsCount } = applyLanguageGlossDictionaryToAllTexts(selectedVocabLang);
    setSyncStatusMessage(
      `Synchronized ${updatedWordsCount || vocabGlosses.length} word glosses across ${updatedTextsCount} ${selectedVocabLang} text mirror translations.`
    );
    setTimeout(() => setSyncStatusMessage(null), 5000);
  };

  const filteredGlosses = vocabGlosses.filter(
    (g) =>
      !vocabSearch ||
      g.orig.toLowerCase().includes(vocabSearch.toLowerCase()) ||
      g.trans.toLowerCase().includes(vocabSearch.toLowerCase()) ||
      (g.compoundMeaning && g.compoundMeaning.toLowerCase().includes(vocabSearch.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {/* Intro Banner */}
      <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-900/60 text-xs text-amber-200 flex items-start space-x-3">
        <BookOpen className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-100">Cross-Text Persistent Vocabulary Memory</p>
          <p className="text-amber-300/80 mt-0.5">
            Word translations saved here apply automatically across every text in the library in this language.
          </p>
        </div>
      </div>

      {/* Sync Status Toast */}
      {syncStatusMessage && (
        <div className="p-3 rounded-xl bg-emerald-950/80 text-emerald-200 border border-emerald-800 text-xs flex items-center justify-between animate-in fade-in">
          <span>{syncStatusMessage}</span>
          <button
            onClick={() => setSyncStatusMessage(null)}
            className="text-emerald-400 hover:text-emerald-200 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Language Bar & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-900/50 p-3 rounded-2xl border border-stone-800">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1.5 bg-stone-950 px-3 py-1.5 rounded-xl border border-stone-800 text-xs">
            <span className="text-stone-400">Language:</span>
            <select
              value={selectedVocabLang}
              onChange={(e) => setSelectedVocabLang(e.target.value)}
              className="bg-transparent text-amber-200 font-semibold focus:outline-none cursor-pointer"
            >
              {languages.map((l) => (
                <option key={l.id} value={l.name} className="bg-stone-900 text-stone-200">
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="relative min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="text"
              placeholder="Search vocabulary..."
              value={vocabSearch}
              onChange={(e) => setVocabSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-xs text-stone-200 focus:outline-none focus:border-amber-600"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleApplyDictionaryToAllTexts}
            disabled={vocabGlosses.length === 0}
            className="px-3.5 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-amber-300 text-xs font-medium border border-amber-900/50 flex items-center space-x-1.5 transition disabled:opacity-40 cursor-pointer"
            title="Apply all persistent word glosses to every text in this language"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Apply to All Texts</span>
          </button>
          <button
            onClick={handleOpenCreateGloss}
            className="px-3.5 py-1.5 rounded-xl bg-amber-800 hover:bg-amber-700 text-amber-50 text-xs font-semibold flex items-center space-x-1.5 shadow-md transition cursor-pointer"
            id="btn-add-vocab-gloss"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Word Gloss</span>
          </button>
        </div>
      </div>

      {/* Glosses Table */}
      {filteredGlosses.length === 0 ? (
        <div className="p-8 text-center bg-stone-900/40 rounded-2xl border border-stone-800 text-stone-500 text-xs space-y-1">
          <p>No persistent word glosses found for {selectedVocabLang}.</p>
          <p className="text-[11px] text-stone-600">
            Click "Add Word Gloss" or use "Save to Language Dictionary" inside any reader view to build this list!
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-800 bg-stone-900">
          <table className="w-full text-left text-xs text-stone-300">
            <thead className="bg-stone-950 text-[11px] text-stone-400 font-semibold border-b border-stone-800 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Original Word</th>
                <th className="px-4 py-3">English Gloss</th>
                <th className="px-4 py-3">Compound Meaning</th>
                <th className="px-4 py-3 text-center">Untranslated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 font-sans">
              {filteredGlosses.map((gloss) => (
                <tr key={gloss.cleanOrig} className="hover:bg-stone-850/50 transition">
                  <td className="px-4 py-2.5 font-serif font-bold text-amber-200 text-sm">
                    {gloss.orig}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-stone-100">
                    {gloss.trans}
                  </td>
                  <td className="px-4 py-2.5 text-stone-400 italic">
                    {gloss.compoundMeaning || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {gloss.keepOrig ? (
                      <span className="px-2 py-0.5 rounded-md bg-stone-800 text-[10px] text-amber-300 border border-stone-700">
                        Kept
                      </span>
                    ) : (
                      <span className="text-stone-600 text-[10px]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-1 whitespace-nowrap">
                    <button
                      onClick={() => handleOpenEditGloss(gloss)}
                      className="p-1 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-amber-300 transition cursor-pointer"
                      title="Edit Gloss"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteGloss(gloss.cleanOrig)}
                      className="p-1 rounded-lg hover:bg-red-950 text-stone-500 hover:text-red-400 transition cursor-pointer"
                      title="Delete Gloss"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Vocabulary Modal */}
      {isVocabModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl text-stone-100 flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-5 border-b border-stone-800 flex items-center justify-between bg-stone-900">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-amber-950 text-amber-400 border border-amber-800/60">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-serif font-semibold text-amber-100">
                    {editingGloss ? 'Edit Cross-Text Word Gloss' : `Add Word Gloss (${selectedVocabLang})`}
                  </h3>
                  <p className="text-xs text-stone-400">
                    Word translations saved here are used consistently across all texts of this language
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsVocabModalOpen(false)}
                className="p-2 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGlossForm} className="p-4 sm:p-6 space-y-4 text-xs font-sans">
              <div className="space-y-1.5">
                <label className="text-stone-300 font-medium">Original Word Token *</label>
                <input
                  type="text"
                  id="gloss-orig"
                  required
                  defaultValue={editingGloss?.orig || ''}
                  placeholder="e.g. Nutzwert or zeichnet"
                  className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-amber-200 font-serif font-bold text-sm focus:outline-none focus:border-amber-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-stone-300 font-medium">English Translation / Mirror Gloss *</label>
                <input
                  type="text"
                  id="gloss-trans"
                  required
                  defaultValue={editingGloss?.trans || ''}
                  placeholder="e.g. usefulness-value or draws"
                  className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 focus:outline-none focus:border-amber-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-stone-300 font-medium">Compound / Idiomatic Meaning (Optional)</label>
                <input
                  type="text"
                  id="gloss-compound"
                  defaultValue={editingGloss?.compoundMeaning || ''}
                  placeholder="e.g. distinguishes (for separable 'zeichnet ... aus')"
                  className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-300 focus:outline-none focus:border-amber-600"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="gloss-keepOrig"
                  defaultChecked={editingGloss?.keepOrig}
                  className="w-4 h-4 rounded bg-stone-950 border-stone-800 text-amber-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="gloss-keepOrig" className="text-stone-300 cursor-pointer select-none">
                  Keep original word untranslated by default in mirror view
                </label>
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsVocabModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-amber-50 font-semibold shadow-md transition cursor-pointer"
                >
                  Save Gloss
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
