import React from 'react';
import { Cpu, X, Check } from 'lucide-react';

interface CalquePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingPromptId: string | null;
  promptFormTitle: string;
  setPromptFormTitle: (val: string) => void;
  promptFormDesc: string;
  setPromptFormDesc: (val: string) => void;
  promptFormSys: string;
  setPromptFormSys: (val: string) => void;
  promptFormBody: string;
  setPromptFormBody: (val: string) => void;
  onSavePromptTemplate: () => void;
}

export const CalquePromptModal: React.FC<CalquePromptModalProps> = ({
  isOpen,
  onClose,
  editingPromptId,
  promptFormTitle,
  setPromptFormTitle,
  promptFormDesc,
  setPromptFormDesc,
  promptFormSys,
  setPromptFormSys,
  promptFormBody,
  setPromptFormBody,
  onSavePromptTemplate,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md p-5 flex flex-col justify-between animate-fade-in">
      <div className="flex items-center justify-between border-b border-stone-800 pb-3">
        <div className="flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-amber-400" />
          <h4 className="font-semibold text-stone-100 text-sm">
            {editingPromptId ? 'Edit Prompt Template' : 'Create Custom Prompt Template'}
          </h4>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3 my-3 flex-1 overflow-y-auto text-xs">
        <div className="space-y-1">
          <label className="text-stone-300 font-medium">Template Title:</label>
          <input
            type="text"
            value={promptFormTitle}
            onChange={(e) => setPromptFormTitle(e.target.value)}
            placeholder="e.g. Strict Latin Interlinear with Verb Brackets"
            className="w-full bg-stone-900 border border-stone-700 rounded-xl p-2 text-stone-100 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
          />
        </div>

        <div className="space-y-1">
          <label className="text-stone-300 font-medium">Description (Optional):</label>
          <input
            type="text"
            value={promptFormDesc}
            onChange={(e) => setPromptFormDesc(e.target.value)}
            placeholder="Brief summary of when to use this template..."
            className="w-full bg-stone-900 border border-stone-700 rounded-xl p-2 text-stone-100 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
          />
        </div>

        <div className="space-y-1">
          <label className="text-stone-300 font-medium">System Instructions (Optional):</label>
          <textarea
            value={promptFormSys}
            onChange={(e) => setPromptFormSys(e.target.value)}
            rows={3}
            placeholder="System persona instructions..."
            className="w-full bg-stone-900 border border-stone-700 rounded-xl p-2 font-mono text-stone-200 focus:outline-hidden focus:ring-1 focus:ring-amber-400 leading-relaxed"
          />
        </div>

        <div className="space-y-1">
          <label className="text-stone-300 font-medium">User Prompt & Rules Template:</label>
          <textarea
            value={promptFormBody}
            onChange={(e) => setPromptFormBody(e.target.value)}
            rows={8}
            placeholder="Provide instructions and output formatting rules for word-for-word calque..."
            className="w-full bg-stone-900 border border-stone-700 rounded-xl p-2 font-mono text-stone-200 focus:outline-hidden focus:ring-1 focus:ring-amber-400 leading-relaxed"
          />
        </div>
      </div>

      <div className="flex items-center justify-end space-x-2 border-t border-stone-800 pt-3">
        <button
          onClick={onClose}
          className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs"
        >
          Cancel
        </button>
        <button
          onClick={onSavePromptTemplate}
          disabled={!promptFormTitle.trim() || !promptFormBody.trim()}
          className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-semibold rounded-xl text-xs flex items-center space-x-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Save Template</span>
        </button>
      </div>
    </div>
  );
};
