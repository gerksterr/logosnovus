import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Cpu, 
  BookOpen, 
  Languages, 
  Layers, 
  Globe 
} from 'lucide-react';
import { 
  QueryBlueprint, 
  LLMConfig, 
  LanguageItem, 
  LLMModelBlueprint, 
  CalquePromptTemplate 
} from '../types';
import { 
  getStoredLanguages, 
  getStoredLLMModelBlueprints, 
  getStoredCalquePrompts 
} from '../services/storageService';
import { QueryBlueprintsTab } from './blueprints/QueryBlueprintsTab';
import { ModelBlueprintsTab } from './blueprints/ModelBlueprintsTab';
import { CalquePromptsTab } from './blueprints/CalquePromptsTab';
import { VocabularyGlossesTab } from './blueprints/VocabularyGlossesTab';
import { LanguagesTab } from './blueprints/LanguagesTab';

interface BlueprintManagerViewProps {
  blueprints: QueryBlueprint[];
  onSaveBlueprint: (bp: QueryBlueprint) => void;
  onDeleteBlueprint: (id: string) => void;
  llmConfig: LLMConfig;
  languages?: LanguageItem[];
  onRefreshLanguages?: () => void;
  llmModelBlueprints?: LLMModelBlueprint[];
  onRefreshLLMModels?: () => void;
  onSelectModelBlueprint?: (model: LLMModelBlueprint) => void;
}

type TabCategory = 'queries' | 'models' | 'calques' | 'vocabulary' | 'languages';

export const BlueprintManagerView: React.FC<BlueprintManagerViewProps> = ({
  blueprints,
  onSaveBlueprint,
  onDeleteBlueprint,
  llmConfig,
  languages: initialLanguages,
  onRefreshLanguages,
  llmModelBlueprints: initialLLMModels,
  onRefreshLLMModels,
  onSelectModelBlueprint,
}) => {
  const [activeTab, setActiveTab] = useState<TabCategory>('queries');
  const [searchQuery, setSearchQuery] = useState('');

  // Data lists
  const [languages, setLanguages] = useState<LanguageItem[]>(initialLanguages || getStoredLanguages());
  const [llmModels, setLlmModels] = useState<LLMModelBlueprint[]>(initialLLMModels || getStoredLLMModelBlueprints());
  const [calquePrompts, setCalquePrompts] = useState<CalquePromptTemplate[]>(getStoredCalquePrompts());

  // Reload data
  const reloadData = () => {
    setLanguages(getStoredLanguages());
    setLlmModels(getStoredLLMModelBlueprints());
    setCalquePrompts(getStoredCalquePrompts());
    if (onRefreshLanguages) onRefreshLanguages();
    if (onRefreshLLMModels) onRefreshLLMModels();
  };

  useEffect(() => {
    reloadData();
  }, []);

  const handleSetAllToGlobalModel = () => {
    const updated = blueprints.map((b) => {
      const copy = { ...b, updatedAt: new Date().toISOString() };
      delete copy.modelBlueprintId;
      return copy;
    });
    updated.forEach((bp) => onSaveBlueprint(bp));

    const calques = getStoredCalquePrompts();
    const updatedCalques = calques.map((c) => {
      const copy = { ...c };
      delete copy.modelBlueprintId;
      return copy;
    });
    try {
      localStorage.setItem('symbolic_calque_prompts_v1', JSON.stringify(updatedCalques));
      setCalquePrompts(updatedCalques);
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-28 space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-800 pb-5">
        <div>
          <h2 className="text-2xl font-serif font-bold text-amber-100 flex items-center space-x-2.5">
            <Sparkles className="w-6 h-6 text-amber-400" />
            <span>Blueprint & Model Architecture</span>
          </h2>
          <p className="text-xs text-stone-400 mt-1">
            Manage Query Prompts, Decoupled LLM Model Blueprints, Mirror Calques, and Cross-Text Language Memory.
          </p>
        </div>

        {/* Global Action */}
        {(activeTab === 'queries' || activeTab === 'calques') && (
          <button
            onClick={handleSetAllToGlobalModel}
            className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-stone-100 text-xs font-medium border border-stone-800 flex items-center space-x-1.5 transition cursor-pointer"
            title="Reset all blueprints to Use Active Global Model by default"
            id="btn-set-all-global-model"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>Set All to Global Model</span>
          </button>
        )}
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-stone-800/80 pb-3 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('queries')}
          className={`px-4 py-2 rounded-xl text-xs font-medium flex items-center space-x-2 transition shrink-0 cursor-pointer ${
            activeTab === 'queries'
              ? 'bg-amber-900/80 text-amber-100 border border-amber-600/70 shadow-sm'
              : 'bg-stone-900/70 text-stone-400 hover:text-stone-200 border border-stone-800'
          }`}
          id="tab-queries"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Query Blueprints ({blueprints.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('models')}
          className={`px-4 py-2 rounded-xl text-xs font-medium flex items-center space-x-2 transition shrink-0 cursor-pointer ${
            activeTab === 'models'
              ? 'bg-cyan-950 text-cyan-200 border border-cyan-700/80 shadow-sm'
              : 'bg-stone-900/70 text-stone-400 hover:text-stone-200 border border-stone-800'
          }`}
          id="tab-models"
        >
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span>LLM Models ({llmModels.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('calques')}
          className={`px-4 py-2 rounded-xl text-xs font-medium flex items-center space-x-2 transition shrink-0 cursor-pointer ${
            activeTab === 'calques'
              ? 'bg-emerald-950 text-emerald-200 border border-emerald-700/80 shadow-sm'
              : 'bg-stone-900/70 text-stone-400 hover:text-stone-200 border border-stone-800'
          }`}
          id="tab-calques"
        >
          <Layers className="w-4 h-4 text-emerald-400" />
          <span>Mirror Blueprints ({calquePrompts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('vocabulary')}
          className={`px-4 py-2 rounded-xl text-xs font-medium flex items-center space-x-2 transition shrink-0 cursor-pointer ${
            activeTab === 'vocabulary'
              ? 'bg-amber-950 text-amber-200 border border-amber-700/80 shadow-sm'
              : 'bg-stone-900/70 text-stone-400 hover:text-stone-200 border border-stone-800'
          }`}
          id="tab-vocabulary"
        >
          <BookOpen className="w-4 h-4 text-amber-400" />
          <span>Cross-Text Vocabulary Sync</span>
        </button>

        <button
          onClick={() => setActiveTab('languages')}
          className={`px-4 py-2 rounded-xl text-xs font-medium flex items-center space-x-2 transition shrink-0 cursor-pointer ${
            activeTab === 'languages'
              ? 'bg-indigo-950 text-indigo-200 border border-indigo-700/80 shadow-sm'
              : 'bg-stone-900/70 text-stone-400 hover:text-stone-200 border border-stone-800'
          }`}
          id="tab-languages"
        >
          <Languages className="w-4 h-4 text-indigo-400" />
          <span>Languages ({languages.length})</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'queries' && (
        <QueryBlueprintsTab
          blueprints={blueprints}
          languages={languages}
          onSaveBlueprint={onSaveBlueprint}
          onDeleteBlueprint={onDeleteBlueprint}
          llmConfig={llmConfig}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      )}

      {activeTab === 'models' && (
        <ModelBlueprintsTab
          llmModels={llmModels}
          setLlmModels={setLlmModels}
          onRefreshLLMModels={onRefreshLLMModels}
          onSelectModelBlueprint={onSelectModelBlueprint}
        />
      )}

      {activeTab === 'calques' && (
        <CalquePromptsTab
          calquePrompts={calquePrompts}
          setCalquePrompts={setCalquePrompts}
          languages={languages}
        />
      )}

      {activeTab === 'vocabulary' && (
        <VocabularyGlossesTab languages={languages} />
      )}

      {activeTab === 'languages' && (
        <LanguagesTab
          languages={languages}
          setLanguages={setLanguages}
          onRefreshLanguages={onRefreshLanguages}
        />
      )}
    </div>
  );
};
