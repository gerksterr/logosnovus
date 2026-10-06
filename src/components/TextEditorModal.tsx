import React, { useState, useEffect } from 'react';
import { X, Sparkles, Clipboard, BookOpen, Tag, Plus, Check, Globe } from 'lucide-react';
import { TextItem, QueryBlueprint, LanguageItem } from '../types';
import { getStoredLanguages, saveLanguage } from '../services/storageService';

interface TextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  textToEdit: TextItem | null;
  blueprints: QueryBlueprint[];
  onSave: (text: TextItem) => void;
  languages?: LanguageItem[];
}

export const TextEditorModal: React.FC<TextEditorModalProps> = ({
  isOpen,
  onClose,
  textToEdit,
  blueprints,
  onSave,
  languages: passedLanguages,
}) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [language, setLanguage] = useState('German');
  const [content, setContent] = useState('');
  const [wordBlueprintId, setWordBlueprintId] = useState('');
  const [passageBlueprintId, setPassageBlueprintId] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  // Custom language addition inline
  const [languagesList, setLanguagesList] = useState<LanguageItem[]>([]);
  const [isAddingCustomLang, setIsAddingCustomLang] = useState(false);
  const [newLangName, setNewLangName] = useState('');
  const [newLangCode, setNewLangCode] = useState('');

  useEffect(() => {
    if (passedLanguages && passedLanguages.length > 0) {
      setLanguagesList(passedLanguages);
    } else {
      setLanguagesList(getStoredLanguages());
    }
  }, [passedLanguages, isOpen]);

  // Blueprints applicable to chosen language
  const applicableBlueprints = blueprints.filter(
    (b) => !b.language || b.language === 'all' || b.language.toLowerCase() === language.toLowerCase()
  );

  const wordBlueprints = applicableBlueprints.filter((b) => b.type === 'word');
  const passageBlueprints = applicableBlueprints.filter((b) => b.type === 'passage');

  // If no language-specific word blueprints, fall back to all word blueprints
  const displayWordBlueprints = wordBlueprints.length > 0 ? wordBlueprints : blueprints.filter((b) => b.type === 'word');
  const displayPassageBlueprints = passageBlueprints.length > 0 ? passageBlueprints : blueprints.filter((b) => b.type === 'passage');

  useEffect(() => {
    if (textToEdit) {
      setTitle(textToEdit.title);
      setAuthor(textToEdit.author || '');
      setLanguage(textToEdit.language || 'German');
      setContent(textToEdit.content);
      setWordBlueprintId(textToEdit.wordBlueprintId);
      setPassageBlueprintId(textToEdit.passageBlueprintId);
      setTags(textToEdit.tags || []);
      setNotes(textToEdit.notes || '');
    } else {
      const defaultWordBp = displayWordBlueprints.find((b) => b.isDefault) || displayWordBlueprints[0];
      const defaultPassageBp = displayPassageBlueprints.find((b) => b.isDefault) || displayPassageBlueprints[0];

      setTitle('');
      setAuthor('');
      setLanguage('German');
      setContent('');
      setWordBlueprintId(defaultWordBp?.id || '');
      setPassageBlueprintId(defaultPassageBp?.id || '');
      setTags(['Symbolism']);
      setNotes('');
    }
  }, [textToEdit, isOpen]);

  if (!isOpen) return null;

  const handlePasteClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        setContent((prev) => (prev ? prev + '\n\n' + clipText : clipText));
      }
    } catch (err) {
      alert('Unable to read clipboard automatically. Please paste directly into the text box.');
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleAddNewLanguage = () => {
    if (!newLangName.trim()) return;
    const newLangItem: LanguageItem = {
      id: `lang-${Date.now()}`,
      name: newLangName.trim(),
      code: newLangCode.trim().toLowerCase() || newLangName.trim().slice(0, 3).toLowerCase(),
      isCustom: true,
    };
    const updated = saveLanguage(newLangItem);
    setLanguagesList(updated);
    setLanguage(newLangItem.name);
    setNewLangName('');
    setNewLangCode('');
    setIsAddingCustomLang(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    const newText: TextItem = {
      id: textToEdit ? textToEdit.id : `text-${Date.now()}`,
      title: title.trim(),
      author: author.trim() || undefined,
      language: language.trim(),
      content: content.trim(),
      wordBlueprintId: wordBlueprintId || (displayWordBlueprints[0]?.id || ''),
      passageBlueprintId: passageBlueprintId || (displayPassageBlueprints[0]?.id || ''),
      tags,
      notes: notes.trim() || undefined,
      createdAt: textToEdit ? textToEdit.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(newText);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto"
    >
      <div 
        className="w-full max-w-xl bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl text-stone-100 flex flex-col max-h-[90vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-800 flex items-center justify-between bg-stone-900">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-950 text-amber-400 border border-amber-800/60">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-serif font-semibold text-amber-100">
                {textToEdit ? 'Edit Symbolic Text' : 'Add New Foreign Text'}
              </h3>
              <p className="text-xs text-stone-400">
                Store text & configure associated query blueprints
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition cursor-pointer"
            id="btn-close-text-editor-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs font-sans">
          {/* Title & Author */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-amber-200 font-medium">Text Title *</label>
              <input
                type="text"
                required
                placeholder="e.g., Carl Jung – Liber Novus (Red Book)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 placeholder-stone-600 focus:outline-hidden focus:border-amber-600 text-xs"
                id="input-text-title"
              />
            </div>

            <div className="space-y-1">
              <label className="text-stone-300 font-medium">Author / Origin</label>
              <input
                type="text"
                placeholder="e.g., Carl Gustav Jung, Nietzsche"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 placeholder-stone-600 focus:outline-hidden focus:border-amber-600 text-xs"
                id="input-text-author"
              />
            </div>
          </div>

          {/* Language selection with custom language support */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-stone-300 font-medium flex items-center space-x-1.5">
                <Globe className="w-3.5 h-3.5 text-amber-400" />
                <span>Original Language</span>
              </label>
              <button
                type="button"
                onClick={() => setIsAddingCustomLang(!isAddingCustomLang)}
                className="text-[11px] text-amber-400 hover:text-amber-300 transition cursor-pointer"
              >
                {isAddingCustomLang ? 'Cancel' : '+ Add New Language'}
              </button>
            </div>

            {isAddingCustomLang ? (
              <div className="p-3 rounded-xl bg-stone-950 border border-amber-800/60 space-y-2">
                <div className="text-[11px] text-amber-300 font-medium">Define New Language:</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Language Name (e.g., Aramaic)"
                    value={newLangName}
                    onChange={(e) => setNewLangName(e.target.value)}
                    className="p-2 bg-stone-900 border border-stone-700 rounded-lg text-xs text-stone-100"
                  />
                  <input
                    type="text"
                    placeholder="Code (e.g., arc)"
                    value={newLangCode}
                    onChange={(e) => setNewLangCode(e.target.value)}
                    className="p-2 bg-stone-900 border border-stone-700 rounded-lg text-xs text-stone-100"
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingCustomLang(false)}
                    className="px-2.5 py-1 rounded bg-stone-800 text-stone-400 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddNewLanguage}
                    disabled={!newLangName.trim()}
                    className="px-3 py-1 rounded bg-amber-600 text-stone-950 font-semibold text-xs disabled:opacity-40"
                  >
                    Save & Select Language
                  </button>
                </div>
              </div>
            ) : (
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 focus:outline-hidden focus:border-amber-600 text-xs"
                id="select-text-language"
              >
                {languagesList.map((lang) => (
                  <option key={lang.id} value={lang.name}>
                    {lang.name} {lang.isCustom ? '(Custom)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Text Content Field with Paste Button & Formatting Tags */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-amber-200 font-medium">Foreign Text Content *</label>
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center space-x-1 cursor-pointer"
                id="btn-paste-clipboard"
              >
                <Clipboard className="w-3 h-3" />
                <span>Paste Clipboard</span>
              </button>
            </div>
            
            {/* Quick Formatting Tags Helper Bar */}
            <div className="flex flex-wrap items-center gap-1.5 py-1 px-2 rounded-lg bg-stone-950/60 border border-stone-800/80 text-[11px] text-stone-400">
              <span className="text-stone-500 font-medium">Tags:</span>
              <button
                type="button"
                onClick={() => setContent((c) => c + '[Red]text[/Red]')}
                className="px-1.5 py-0.5 rounded bg-red-950/50 hover:bg-red-900/60 border border-red-800/50 text-red-300 transition cursor-pointer"
                title="Insert [Red]...[/Red]"
              >
                [Red]
              </button>
              <button
                type="button"
                onClick={() => setContent((c) => c + '[Blue]text[/Blue]')}
                className="px-1.5 py-0.5 rounded bg-blue-950/50 hover:bg-blue-900/60 border border-blue-800/50 text-blue-300 transition cursor-pointer"
                title="Insert [Blue]...[/Blue]"
              >
                [Blue]
              </button>
              <button
                type="button"
                onClick={() => setContent((c) => c + '[hang:3][Red]D[/Red][/hang]ie')}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-300 transition font-serif cursor-pointer"
                title="Insert Drop Cap [hang:X]...[/hang]"
              >
                [hang:X] Drop Cap
              </button>
              <span className="text-stone-500 text-[10px] ml-auto hidden sm:inline">
                e.g. [hang:3][Red]D[/Red][/hang]iesen
              </span>
            </div>

            <textarea
              required
              rows={8}
              placeholder="Paste original foreign symbolic text here (Hebrew, Greek, Latin, German, Sanskrit, etc.). Supports [Red], [Blue], and [hang:X] tags..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              dir="auto"
              className="w-full p-3 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 placeholder-stone-600 focus:outline-hidden focus:border-amber-600 text-xs font-serif leading-relaxed"
              id="textarea-text-content"
            />
          </div>

          {/* Blueprint References Section */}
          <div className="p-3.5 rounded-2xl bg-stone-950/80 border border-amber-900/40 space-y-3">
            <div className="flex items-center space-x-2 text-amber-300 font-serif font-medium text-xs">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Associated Query Blueprints (Applicable to {language})</span>
            </div>
            <p className="text-[11px] text-stone-400 leading-normal">
              Select which query prompt blueprints to default when tapping words or selecting passages in this text.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Word Blueprint Select */}
              <div className="space-y-1">
                <label className="text-amber-200/90 text-[11px] font-medium">
                  Word Query Blueprint ({'{word}'})
                </label>
                <select
                  value={wordBlueprintId}
                  onChange={(e) => setWordBlueprintId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-stone-900 border border-stone-800 text-stone-200 text-xs focus:border-amber-600"
                  id="select-word-blueprint"
                >
                  {displayWordBlueprints.map((bp) => (
                    <option key={bp.id} value={bp.id}>
                      {bp.name} {bp.isDefault ? '(Default)' : ''} {bp.language && bp.language !== 'all' ? `[${bp.language}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Passage Blueprint Select */}
              <div className="space-y-1">
                <label className="text-purple-200/90 text-[11px] font-medium">
                  Passage Query Blueprint ({'{text}'})
                </label>
                <select
                  value={passageBlueprintId}
                  onChange={(e) => setPassageBlueprintId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-stone-900 border border-stone-800 text-stone-200 text-xs focus:border-amber-600"
                  id="select-passage-blueprint"
                >
                  {displayPassageBlueprints.map((bp) => (
                    <option key={bp.id} value={bp.id}>
                      {bp.name} {bp.isDefault ? '(Default)' : ''} {bp.language && bp.language !== 'all' ? `[${bp.language}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1">
            <label className="text-stone-300 font-medium">Tags & Categories</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="e.g. Archetypes, Alchemy, Gnosticism"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="flex-1 px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 placeholder-stone-600 focus:outline-hidden focus:border-amber-600 text-xs"
                id="input-tag"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition cursor-pointer"
                id="btn-add-tag"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-stone-800 text-amber-200 border border-stone-700 text-[11px]"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-red-400 ml-1 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* User Notes */}
          <div className="space-y-1">
            <label className="text-stone-300 font-medium">Notes / Contextual Apparatus</label>
            <textarea
              rows={3}
              placeholder="Add historical provenance, manuscript folio numbers, or personal notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 placeholder-stone-600 focus:outline-hidden focus:border-amber-600 text-xs font-sans"
              id="textarea-text-notes"
            />
          </div>

          {/* Footer Save Button */}
          <div className="pt-2 border-t border-stone-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs flex items-center space-x-1.5 shadow-md transition cursor-pointer"
              id="btn-submit-save-text"
            >
              <Check className="w-4 h-4" />
              <span>{textToEdit ? 'Save Changes' : 'Create Text'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
