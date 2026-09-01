import React, { useState, useEffect } from 'react';
import { X, Sparkles, Clipboard, BookOpen, Tag, Plus, Check } from 'lucide-react';
import { TextItem, QueryBlueprint } from '../types';

interface TextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  textToEdit: TextItem | null;
  blueprints: QueryBlueprint[];
  onSave: (text: TextItem) => void;
}

export const TextEditorModal: React.FC<TextEditorModalProps> = ({
  isOpen,
  onClose,
  textToEdit,
  blueprints,
  onSave,
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

  const wordBlueprints = blueprints.filter((b) => b.type === 'word');
  const passageBlueprints = blueprints.filter((b) => b.type === 'passage');

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
      // Default selections
      const defaultWordBp = wordBlueprints.find((b) => b.isDefault) || wordBlueprints[0];
      const defaultPassageBp = passageBlueprints.find((b) => b.isDefault) || passageBlueprints[0];

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    const newText: TextItem = {
      id: textToEdit ? textToEdit.id : `text-${Date.now()}`,
      title: title.trim(),
      author: author.trim() || undefined,
      language: language.trim(),
      content: content.trim(),
      wordBlueprintId: wordBlueprintId || (wordBlueprints[0]?.id || ''),
      passageBlueprintId: passageBlueprintId || (passageBlueprints[0]?.id || ''),
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
            className="p-2 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition"
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

          {/* Language selection */}
          <div className="space-y-1">
            <label className="text-stone-300 font-medium">Original Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 focus:outline-hidden focus:border-amber-600 text-xs"
              id="select-text-language"
            >
              <option value="German">German / Biblical German</option>
              <option value="Latin">Latin / Medieval Latin</option>
              <option value="Greek">Ancient Greek / Koine</option>
              <option value="Sanskrit">Sanskrit</option>
              <option value="French">French</option>
              <option value="Hebrew">Hebrew / Biblical Hebrew</option>
              <option value="Other">Other Foreign Language</option>
            </select>
          </div>

          {/* Text Content Field with Paste Button & Formatting Tags */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-amber-200 font-medium">Foreign Text Content *</label>
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center space-x-1"
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
                className="px-1.5 py-0.5 rounded bg-red-950/50 hover:bg-red-900/60 border border-red-800/50 text-red-300 transition"
                title="Insert [Red]...[/Red]"
              >
                [Red]
              </button>
              <button
                type="button"
                onClick={() => setContent((c) => c + '[Blue]text[/Blue]')}
                className="px-1.5 py-0.5 rounded bg-blue-950/50 hover:bg-blue-900/60 border border-blue-800/50 text-blue-300 transition"
                title="Insert [Blue]...[/Blue]"
              >
                [Blue]
              </button>
              <button
                type="button"
                onClick={() => setContent((c) => c + '[hang:3][Red]D[/Red][/hang]ie')}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-300 transition font-serif"
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
              placeholder="Paste original foreign symbolic text here (Hebrew, Greek, Latin, German, etc.). Supports [Red], [Blue], and [hang:X] tags..."
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
              <span>Associated Query Blueprints</span>
            </div>
            <p className="text-[11px] text-stone-400 leading-normal">
              Select which query prompt blueprints to reference when tapping words or selecting passages in this text.
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
                  {wordBlueprints.map((bp) => (
                    <option key={bp.id} value={bp.id}>
                      {bp.name} {bp.isDefault ? '(Default)' : ''}
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
                  {passageBlueprints.map((bp) => (
                    <option key={bp.id} value={bp.id}>
                      {bp.name} {bp.isDefault ? '(Default)' : ''}
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
                placeholder="Add tag (e.g., Red Book, Alchemy)..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="flex-1 px-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 placeholder-stone-600 text-xs"
                id="input-add-tag"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium"
                id="btn-add-tag"
              >
                Add
              </button>
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/50 text-[11px]"
                  >
                    <span>#{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-red-400 ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-stone-300 font-medium">Personal Notes / Context</label>
            <input
              type="text"
              placeholder="e.g. Chapter 1, Liber Primus, page 12..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 placeholder-stone-600 text-xs"
              id="input-text-notes"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-stone-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium"
              id="btn-cancel-text-editor"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-amber-50 text-xs font-medium flex items-center space-x-1.5 shadow-md"
              id="btn-save-text-item"
            >
              <Check className="w-4 h-4" />
              <span>{textToEdit ? 'Save Changes' : 'Store Text'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
