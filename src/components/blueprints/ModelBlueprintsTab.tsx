import React, { useState } from 'react';
import { 
  Cpu, 
  Plus, 
  Trash2, 
  Edit3, 
  Copy, 
  RefreshCw, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  X,
  FileCode,
  Sliders,
  Check,
  RotateCcw,
  Code,
  FileJson
} from 'lucide-react';
import { LLMModelBlueprint, LLMProviderType, LLMConfig } from '../../types';
import { testLLMConnection } from '../../services/llmService';
import { 
  getStoredModelPresets, 
  addStoredModelPreset, 
  saveLLMModelBlueprint, 
  deleteLLMModelBlueprint,
  saveLLMModelBlueprints
} from '../../services/storageService';

interface ModelBlueprintsTabProps {
  llmModels: LLMModelBlueprint[];
  setLlmModels: (models: LLMModelBlueprint[]) => void;
  onRefreshLLMModels?: () => void;
  onSelectModelBlueprint?: (model: LLMModelBlueprint) => void;
}

export const ModelBlueprintsTab: React.FC<ModelBlueprintsTabProps> = ({
  llmModels,
  setLlmModels,
  onRefreshLLMModels,
  onSelectModelBlueprint,
}) => {
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<LLMModelBlueprint | null>(null);
  const [modalMode, setModalMode] = useState<'form' | 'json'>('form');
  const [rawJsonText, setRawJsonText] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Form states
  const [modelName, setModelName] = useState('');
  const [modelDescription, setModelDescription] = useState('');
  const [modelProvider, setModelProvider] = useState<LLMProviderType>('openrouter');
  const [modelServingName, setModelServingName] = useState('anthropic/claude-3.7-sonnet');
  const [modelTemperature, setModelTemperature] = useState<number>(0.3);
  const [modelBaseUrl, setModelBaseUrl] = useState('');
  const [modelApiKey, setModelApiKey] = useState('');
  const [modelSystemInstruction, setModelSystemInstruction] = useState('');
  const [modelTestResult, setModelTestResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [modelPresets, setModelPresets] = useState<string[]>(getStoredModelPresets());

  // Batch All Models JSON Modal
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchJsonText, setBatchJsonText] = useState<string>('');
  const [batchJsonError, setBatchJsonError] = useState<string | null>(null);
  const [batchCopied, setBatchCopied] = useState(false);

  // Constructs full LLMModelBlueprint object from current form state
  const getFormAsBlueprintObject = (): LLMModelBlueprint => {
    return {
      id: editingModel ? editingModel.id : `model-bp-${Date.now()}`,
      name: modelName.trim() || 'Untitled Model Blueprint',
      description: modelDescription.trim() || undefined,
      provider: modelProvider,
      modelName: modelServingName.trim() || 'anthropic/claude-3.7-sonnet',
      temperature: modelTemperature,
      customBaseUrl: modelBaseUrl.trim() || undefined,
      customApiKey: modelApiKey.trim() || undefined,
      systemInstruction: modelSystemInstruction.trim() || undefined,
      requestJsonTemplate: editingModel?.requestJsonTemplate,
      customHeaders: editingModel?.customHeaders,
      isDefault: editingModel ? editingModel.isDefault : llmModels.length === 0,
      createdAt: editingModel ? editingModel.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const handleOpenCreateModel = () => {
    setEditingModel(null);
    const initialPath = 'anthropic/claude-3.7-sonnet';
    setModelName(initialPath);
    setModelDescription('');
    setModelProvider('openrouter');
    setModelServingName(initialPath);
    setModelTemperature(0.3);
    setModelBaseUrl('https://openrouter.ai/api/v1/chat/completions');
    setModelApiKey('');
    setModelSystemInstruction('');
    setModelTestResult(null);
    setModelPresets(getStoredModelPresets());
    setModalMode('form');
    setJsonError(null);

    const initialObj: LLMModelBlueprint = {
      id: `model-bp-${Date.now()}`,
      name: initialPath,
      provider: 'openrouter',
      modelName: initialPath,
      temperature: 0.3,
      customBaseUrl: 'https://openrouter.ai/api/v1/chat/completions',
      isDefault: llmModels.length === 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setRawJsonText(JSON.stringify(initialObj, null, 2));
    setIsModelModalOpen(true);
  };

  const handleOpenEditModel = (model: LLMModelBlueprint) => {
    setEditingModel(model);
    setModelName(model.name);
    setModelDescription(model.description || '');
    setModelProvider(model.provider);
    setModelServingName(model.modelName);
    setModelTemperature(model.temperature ?? 0.3);
    setModelBaseUrl(model.customBaseUrl || '');
    setModelApiKey(model.customApiKey || '');
    setModelSystemInstruction(model.systemInstruction || '');
    setModelTestResult(null);
    setModelPresets(getStoredModelPresets());
    setModalMode('form');
    setJsonError(null);
    setRawJsonText(JSON.stringify(model, null, 2));
    setIsModelModalOpen(true);
  };

  const handleOpenRawJsonModel = (model: LLMModelBlueprint) => {
    setEditingModel(model);
    setModelName(model.name);
    setModelDescription(model.description || '');
    setModelProvider(model.provider);
    setModelServingName(model.modelName);
    setModelTemperature(model.temperature ?? 0.3);
    setModelBaseUrl(model.customBaseUrl || '');
    setModelApiKey(model.customApiKey || '');
    setModelSystemInstruction(model.systemInstruction || '');
    setModelTestResult(null);
    setModelPresets(getStoredModelPresets());
    setModalMode('json');
    setJsonError(null);
    setRawJsonText(JSON.stringify(model, null, 2));
    setIsModelModalOpen(true);
  };

  // Switch to Form mode: parses JSON and updates form fields
  const handleSwitchToForm = () => {
    if (modalMode === 'form') return;
    try {
      const parsed = JSON.parse(rawJsonText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setJsonError('JSON must be a valid LLMModelBlueprint object.');
        return;
      }
      if (parsed.name) setModelName(parsed.name);
      if (parsed.description !== undefined) setModelDescription(parsed.description || '');
      if (parsed.provider) setModelProvider(parsed.provider);
      if (parsed.modelName) setModelServingName(parsed.modelName);
      if (typeof parsed.temperature === 'number') setModelTemperature(parsed.temperature);
      if (parsed.customBaseUrl !== undefined) setModelBaseUrl(parsed.customBaseUrl || '');
      if (parsed.customApiKey !== undefined) setModelApiKey(parsed.customApiKey || '');
      if (parsed.systemInstruction !== undefined) setModelSystemInstruction(parsed.systemInstruction || '');
      setJsonError(null);
      setModalMode('form');
    } catch (err: any) {
      setJsonError(`Cannot switch to form: ${err.message}`);
    }
  };

  // Switch to JSON mode: constructs JSON from current form
  const handleSwitchToJson = () => {
    if (modalMode === 'json') return;
    const bpObj = getFormAsBlueprintObject();
    setRawJsonText(JSON.stringify(bpObj, null, 2));
    setJsonError(null);
    setModalMode('json');
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(rawJsonText);
      setRawJsonText(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (err: any) {
      setJsonError(`Syntax Error: ${err.message}`);
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(rawJsonText);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleResetToTemplate = () => {
    const sample: LLMModelBlueprint = {
      id: editingModel?.id || `model-bp-${Date.now()}`,
      name: 'Claude 3.7 Sonnet (Reasoning)',
      description: 'Advanced philological calques and composite analysis',
      provider: 'openrouter',
      modelName: 'anthropic/claude-3.7-sonnet',
      temperature: 0.3,
      customBaseUrl: 'https://openrouter.ai/api/v1/chat/completions',
      customApiKey: '',
      systemInstruction: 'You are a meticulous philological deciphering engine.',
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setRawJsonText(JSON.stringify(sample, null, 2));
    setJsonError(null);
  };

  const handleModelServingNameChange = (newPath: string) => {
    setModelServingName(newPath);
    if (!editingModel || modelName === modelServingName) {
      setModelName(newPath);
    }
  };

  const handleSelectPresetPath = (presetPath: string) => {
    handleModelServingNameChange(presetPath);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();

    if (modalMode === 'json') {
      try {
        const parsed = JSON.parse(rawJsonText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setJsonError('Blueprint JSON must be a single JSON object.');
          return;
        }
        if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
          setJsonError('Blueprint must include a non-empty "name" property.');
          return;
        }
        if (!parsed.modelName || typeof parsed.modelName !== 'string' || !parsed.modelName.trim()) {
          setJsonError('Blueprint must include a non-empty "modelName" (serving path) property.');
          return;
        }
        if (!parsed.provider) {
          setJsonError('Blueprint must include a valid "provider" property (e.g. openrouter, built-in-gemini, custom-openai, groq).');
          return;
        }

        const modelItem: LLMModelBlueprint = {
          id: parsed.id || editingModel?.id || `model-bp-${Date.now()}`,
          name: parsed.name.trim(),
          description: parsed.description?.trim() || undefined,
          provider: parsed.provider,
          modelName: parsed.modelName.trim(),
          temperature: typeof parsed.temperature === 'number' ? parsed.temperature : 0.3,
          customBaseUrl: parsed.customBaseUrl?.trim() || undefined,
          customApiKey: parsed.customApiKey?.trim() || undefined,
          systemInstruction: parsed.systemInstruction?.trim() || undefined,
          requestJsonTemplate: parsed.requestJsonTemplate,
          customHeaders: parsed.customHeaders,
          isDefault: Boolean(parsed.isDefault ?? editingModel?.isDefault ?? false),
          createdAt: parsed.createdAt || editingModel?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const updatedPresets = addStoredModelPreset(modelItem.modelName);
        setModelPresets(updatedPresets);

        const updated = saveLLMModelBlueprint(modelItem);
        setLlmModels(updated);
        if (onRefreshLLMModels) onRefreshLLMModels();
        setIsModelModalOpen(false);
      } catch (err: any) {
        setJsonError(`Invalid JSON: ${err.message}`);
      }
    } else {
      // Form mode save
      if (!modelName.trim() || !modelServingName.trim()) return;

      const trimmedPath = modelServingName.trim();
      const updatedPresets = addStoredModelPreset(trimmedPath);
      setModelPresets(updatedPresets);

      const modelItem: LLMModelBlueprint = {
        id: editingModel ? editingModel.id : `model-bp-${Date.now()}`,
        name: modelName.trim(),
        description: modelDescription.trim() || undefined,
        provider: modelProvider,
        modelName: trimmedPath,
        temperature: modelTemperature,
        customBaseUrl: modelBaseUrl.trim() || undefined,
        customApiKey: modelApiKey.trim() || undefined,
        systemInstruction: modelSystemInstruction.trim() || undefined,
        requestJsonTemplate: editingModel?.requestJsonTemplate,
        customHeaders: editingModel?.customHeaders,
        isDefault: editingModel ? editingModel.isDefault : llmModels.length === 0,
        createdAt: editingModel ? editingModel.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updated = saveLLMModelBlueprint(modelItem);
      setLlmModels(updated);
      if (onRefreshLLMModels) onRefreshLLMModels();
      setIsModelModalOpen(false);
    }
  };

  const handleCloneModel = (model: LLMModelBlueprint) => {
    const cloned: LLMModelBlueprint = {
      ...model,
      id: `model-bp-${Date.now()}`,
      name: `${model.name} (Copy)`,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = saveLLMModelBlueprint(cloned);
    setLlmModels(updated);
    if (onRefreshLLMModels) onRefreshLLMModels();
  };

  const handleActivateModel = (model: LLMModelBlueprint) => {
    const updated = llmModels.map((m) => ({
      ...m,
      isDefault: m.id === model.id,
    }));
    setLlmModels(updated);
    saveLLMModelBlueprints(updated);
    if (onRefreshLLMModels) onRefreshLLMModels();
    if (onSelectModelBlueprint) {
      onSelectModelBlueprint(model);
    }
  };

  const handleDeleteModelItem = (id: string) => {
    if (confirm('Delete this LLM Model Blueprint?')) {
      const updated = deleteLLMModelBlueprint(id);
      setLlmModels(updated);
      if (onRefreshLLMModels) onRefreshLLMModels();
    }
  };

  const handleTestModelConnection = async () => {
    setIsTestingModel(true);
    setModelTestResult(null);
    const testConfig: LLMConfig = {
      provider: modelProvider,
      modelName: modelServingName,
      customBaseUrl: modelBaseUrl || undefined,
      customApiKey: modelApiKey || undefined,
      temperature: modelTemperature,
    };
    try {
      const result = await testLLMConnection(testConfig);
      setModelTestResult(result);
    } catch (err: any) {
      setModelTestResult({ success: false, message: err.message || 'Connection test failed' });
    } finally {
      setIsTestingModel(false);
    }
  };

  // Batch All Models JSON Handlers
  const handleOpenBatchJsonModal = () => {
    setBatchJsonText(JSON.stringify(llmModels, null, 2));
    setBatchJsonError(null);
    setBatchCopied(false);
    setIsBatchModalOpen(true);
  };

  const handleFormatBatchJson = () => {
    try {
      const parsed = JSON.parse(batchJsonText);
      setBatchJsonText(JSON.stringify(parsed, null, 2));
      setBatchJsonError(null);
    } catch (err: any) {
      setBatchJsonError(`Syntax Error: ${err.message}`);
    }
  };

  const handleCopyBatchJson = () => {
    navigator.clipboard.writeText(batchJsonText);
    setBatchCopied(true);
    setTimeout(() => setBatchCopied(false), 2000);
  };

  const handleSaveBatchJson = () => {
    try {
      const parsed = JSON.parse(batchJsonText);
      if (!Array.isArray(parsed)) {
        setBatchJsonError('Root must be an array of LLMModelBlueprint objects: [ { ... } ]');
        return;
      }
      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        if (!item.name || !item.modelName || !item.provider) {
          setBatchJsonError(`Item at index ${i} is missing required fields ("name", "modelName", or "provider").`);
          return;
        }
        if (!item.id) item.id = `model-bp-${Date.now()}-${i}`;
        if (!item.createdAt) item.createdAt = new Date().toISOString();
        item.updatedAt = new Date().toISOString();
      }
      saveLLMModelBlueprints(parsed);
      setLlmModels(parsed);
      if (onRefreshLLMModels) onRefreshLLMModels();
      setIsBatchModalOpen(false);
    } catch (err: any) {
      setBatchJsonError(`Invalid JSON: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-900/50 p-3 rounded-2xl border border-stone-800">
        <div className="flex items-center space-x-2 text-xs text-cyan-200">
          <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>Decoupled Model Blueprints for global query & calque routing ({llmModels.length})</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleOpenBatchJsonModal}
            className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-cyan-200 text-xs font-medium flex items-center space-x-1.5 border border-stone-800 transition cursor-pointer"
            title="View or batch-edit all model blueprints as a raw JSON array"
            id="btn-all-models-json"
          >
            <Code className="w-3.5 h-3.5 text-cyan-400" />
            <span>All Models JSON</span>
          </button>

          <button
            onClick={handleOpenCreateModel}
            className="px-3.5 py-1.5 rounded-xl bg-cyan-800 hover:bg-cyan-700 text-cyan-50 text-xs font-semibold flex items-center space-x-1.5 shadow-md transition cursor-pointer"
            id="btn-create-model-tab"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Model Blueprint</span>
          </button>
        </div>
      </div>

      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {llmModels.map((model) => (
          <div
            key={model.id}
            className="p-4 rounded-2xl bg-stone-900 border border-stone-800/90 shadow-md space-y-3 relative group hover:border-cyan-800/60 transition flex flex-col justify-between"
          >
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                      {model.provider}
                    </span>
                    {model.isDefault && (
                      <span className="text-[10px] bg-stone-800 text-cyan-300 px-2 py-0.5 rounded-full border border-stone-700 font-semibold">
                        Default Active
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-serif font-semibold text-cyan-100 mt-1.5 flex items-center space-x-2">
                    <span>{model.name}</span>
                  </h3>
                </div>

                <div className="flex items-center space-x-1">
                  {!model.isDefault && (
                    <button
                      onClick={() => handleActivateModel(model)}
                      className="px-2 py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800/80 text-[10px] text-cyan-200 transition font-medium cursor-pointer mr-1"
                      title="Set as Active LLM Model"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenRawJsonModel(model)}
                    className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-cyan-300 transition cursor-pointer"
                    title="Edit Raw JSON"
                    id={`btn-edit-json-${model.id}`}
                  >
                    <FileCode className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleCloneModel(model)}
                    className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-cyan-300 transition cursor-pointer"
                    title="Clone / Duplicate Model Blueprint"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleOpenEditModel(model)}
                    className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-cyan-300 transition cursor-pointer"
                    title="Edit Model Blueprint (Form)"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteModelItem(model.id)}
                    className="p-1.5 rounded-lg hover:bg-red-950 text-stone-500 hover:text-red-400 transition cursor-pointer"
                    title="Delete Model Blueprint"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {model.description && (
                <p className="text-xs text-stone-400 italic">
                  {model.description}
                </p>
              )}

              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800/80 text-xs font-mono space-y-1 text-stone-300">
                <div className="flex justify-between">
                  <span className="text-stone-500">Model Path:</span>
                  <span className="text-cyan-300 font-semibold truncate max-w-[220px]">{model.modelName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Temperature:</span>
                  <span>{model.temperature ?? 0.3}</span>
                </div>
                {model.customBaseUrl && (
                  <div className="flex justify-between truncate">
                    <span className="text-stone-500">Base URL:</span>
                    <span className="text-stone-400 truncate max-w-[200px]">{model.customBaseUrl}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 text-[10px] text-stone-500 border-t border-stone-800/60 flex justify-between items-center">
              <span>Referenced by Query & Calque Blueprints</span>
              <span>{new Date(model.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Model Blueprint Modal (Form + Raw JSON Editor) */}
      {isModelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl text-stone-100 flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-stone-800 flex items-center justify-between bg-stone-900 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-serif font-semibold text-cyan-100">
                    {editingModel ? 'Edit LLM Model Blueprint' : 'Create Named LLM Model Blueprint'}
                  </h3>
                  <p className="text-xs text-stone-400">
                    Named models route queries and calque translations across the application
                  </p>
                </div>
              </div>

              {/* Mode Toggle: Visual Form vs Raw JSON */}
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 bg-stone-950 p-1 rounded-xl border border-stone-800">
                  <button
                    type="button"
                    onClick={handleSwitchToForm}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center space-x-1.5 ${
                      modalMode === 'form'
                        ? 'bg-cyan-900/80 text-cyan-100 border border-cyan-700/60 shadow-xs'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                    id="btn-switch-modal-form"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Form</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSwitchToJson}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center space-x-1.5 ${
                      modalMode === 'json'
                        ? 'bg-cyan-900/80 text-cyan-100 border border-cyan-700/60 shadow-xs'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                    id="btn-switch-modal-json"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>Raw JSON</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsModelModalOpen(false)}
                  className="p-2 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveModal} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs font-sans">
              {modalMode === 'json' ? (
                /* RAW JSON EDITOR */
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-950 p-2.5 rounded-2xl border border-stone-800">
                    <div className="text-[11px] text-stone-400 flex items-center space-x-1.5">
                      <FileJson className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>Direct LLM Model Blueprint JSON schema editing</span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={handleFormatJson}
                        className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 text-[11px] font-mono border border-stone-800 transition cursor-pointer"
                        title="Format JSON with 2-space indentation"
                      >
                        Format JSON
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyJson}
                        className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 text-[11px] flex items-center space-x-1 border border-stone-800 transition cursor-pointer"
                      >
                        {copiedJson ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedJson ? 'Copied' : 'Copy'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleResetToTemplate}
                        className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 text-[11px] flex items-center space-x-1 border border-stone-800 transition cursor-pointer"
                        title="Load clean blueprint sample"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Template</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <textarea
                      spellCheck={false}
                      value={rawJsonText}
                      onChange={(e) => {
                        setRawJsonText(e.target.value);
                        try {
                          JSON.parse(e.target.value);
                          setJsonError(null);
                        } catch (err: any) {
                          setJsonError(err.message);
                        }
                      }}
                      className="w-full h-80 sm:h-96 p-4 rounded-2xl bg-stone-950 border border-stone-800 text-cyan-200 font-mono text-xs leading-relaxed focus:outline-none focus:border-cyan-600 shadow-inner"
                      placeholder={`{\n  "name": "Claude 3.7 Sonnet",\n  "provider": "openrouter",\n  "modelName": "anthropic/claude-3.7-sonnet",\n  "temperature": 0.3\n}`}
                    />
                  </div>

                  {jsonError ? (
                    <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span className="font-mono text-[11px]">{jsonError}</span>
                    </div>
                  ) : (
                    <div className="p-2 px-3 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-[11px] flex items-center space-x-1.5 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Valid JSON syntax ready to save</span>
                    </div>
                  )}
                </div>
              ) : (
                /* VISUAL FORM EDITOR */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-stone-300 font-medium">Model Blueprint Name *</label>
                      <input
                        type="text"
                        required
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                        placeholder="e.g. anthropic/claude-3.7-sonnet"
                        className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 focus:outline-none focus:border-cyan-600"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-stone-300 font-medium">Provider Type *</label>
                      <select
                        value={modelProvider}
                        onChange={(e) => {
                          const p = e.target.value as LLMProviderType;
                          setModelProvider(p);
                          if (p === 'openrouter') {
                            handleModelServingNameChange('anthropic/claude-3.7-sonnet');
                            if (!modelBaseUrl) setModelBaseUrl('https://openrouter.ai/api/v1/chat/completions');
                          } else if (p === 'built-in-gemini') {
                            handleModelServingNameChange('gemini-3.7-flash');
                          } else if (p === 'custom-openai') {
                            handleModelServingNameChange('qwen2.5:14b');
                            if (!modelBaseUrl) setModelBaseUrl('http://localhost:11434/v1/chat/completions');
                          } else if (p === 'groq') {
                            handleModelServingNameChange('llama-3.3-70b-versatile');
                          }
                        }}
                        className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-cyan-200 focus:outline-none focus:border-cyan-600 cursor-pointer"
                      >
                        <option value="openrouter">OpenRouter (Claude, DeepSeek, Llama, Qwen, Mistral)</option>
                        <option value="built-in-gemini">Google Gemini (Built-in Server Key)</option>
                        <option value="custom-openai">Custom OpenAI / Local Ollama / LM Studio</option>
                        <option value="groq">Groq (Ultra-fast Llama 3.3)</option>
                        <option value="custom-gemini">Custom Gemini API Key</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-stone-300 font-medium">Serving Model Path *</label>
                        <span className="text-[10px] text-cyan-400">Autocompletes & Memorizes</span>
                      </div>
                      <input
                        type="text"
                        required
                        list="model-path-history-datalist"
                        value={modelServingName}
                        onChange={(e) => handleModelServingNameChange(e.target.value)}
                        placeholder="e.g. anthropic/claude-3.7-sonnet, deepseek/deepseek-r1"
                        className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-cyan-200 font-mono text-xs focus:outline-none focus:border-cyan-600"
                      />
                      <datalist id="model-path-history-datalist">
                        {modelPresets.map((preset, idx) => (
                          <option key={idx} value={preset} />
                        ))}
                      </datalist>

                      {/* Quick Pill Suggestions */}
                      <div className="space-y-1 pt-1">
                        <div className="text-[10px] text-stone-500 font-medium">Quick Select Paths:</div>
                        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                          {modelPresets.slice(0, 10).map((preset, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleSelectPresetPath(preset)}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition border cursor-pointer ${
                                modelServingName === preset
                                  ? 'bg-cyan-900/60 text-cyan-200 border-cyan-600'
                                  : 'bg-stone-900/80 hover:bg-stone-800 text-stone-300 border-stone-800 hover:border-stone-700'
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-stone-300 font-medium">Temperature ({modelTemperature})</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={modelTemperature}
                        onChange={(e) => setModelTemperature(parseFloat(e.target.value))}
                        className="w-full accent-cyan-500 mt-2"
                      />
                      <p className="text-[10px] text-stone-400">
                        Lower temperature produces more deterministic philological glosses and exact word alignments.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-stone-300 font-medium">Description (Optional)</label>
                    <input
                      type="text"
                      value={modelDescription}
                      onChange={(e) => setModelDescription(e.target.value)}
                      placeholder="e.g. Primary reasoning model for complex German composite words"
                      className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 focus:outline-none focus:border-cyan-600"
                    />
                  </div>

                  {(modelProvider === 'custom-openai' || modelProvider === 'custom-gemini' || modelProvider === 'groq' || modelProvider === 'openrouter') && (
                    <div className="space-y-3 p-3.5 rounded-2xl bg-stone-950 border border-stone-800">
                      <div className="space-y-1.5">
                        <label className="text-stone-300 font-medium">Custom Base URL (Optional)</label>
                        <input
                          type="text"
                          value={modelBaseUrl}
                          onChange={(e) => setModelBaseUrl(e.target.value)}
                          placeholder="e.g. http://localhost:11434/v1/chat/completions"
                          className="w-full p-2.5 rounded-xl bg-stone-900 border border-stone-800 text-stone-200 font-mono text-xs focus:outline-none focus:border-cyan-600"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-stone-300 font-medium">API Key Override (Optional)</label>
                        <input
                          type="password"
                          value={modelApiKey}
                          onChange={(e) => setModelApiKey(e.target.value)}
                          placeholder="sk-..."
                          className="w-full p-2.5 rounded-xl bg-stone-900 border border-stone-800 text-stone-200 font-mono text-xs focus:outline-none focus:border-cyan-600"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-stone-300 font-medium">System Instruction Override (Optional)</label>
                    <textarea
                      rows={2}
                      value={modelSystemInstruction}
                      onChange={(e) => setModelSystemInstruction(e.target.value)}
                      placeholder="e.g. You are a distinguished comparative philologist."
                      className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-stone-200 text-xs focus:outline-none focus:border-cyan-600"
                    />
                  </div>

                  {/* Test Connection */}
                  <div className="p-3.5 rounded-2xl bg-stone-950 border border-stone-800 flex flex-col space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-stone-300">Test Model Connectivity</span>
                      <button
                        type="button"
                        onClick={handleTestModelConnection}
                        disabled={isTestingModel}
                        className="px-3 py-1 rounded-lg bg-cyan-900 hover:bg-cyan-800 text-cyan-100 text-[11px] font-medium flex items-center space-x-1.5 transition disabled:opacity-50 cursor-pointer"
                      >
                        {isTestingModel ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        <span>{isTestingModel ? 'Pinging...' : 'Test Connection'}</span>
                      </button>
                    </div>

                    {modelTestResult && (
                      <div className={`p-2.5 rounded-xl text-xs flex items-center space-x-2 ${
                        modelTestResult.success ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-800' : 'bg-red-950/80 text-red-200 border border-red-800'
                      }`}>
                        {modelTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                        <span>{modelTestResult.message}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="pt-3 flex justify-between items-center border-t border-stone-800 shrink-0">
                <div className="text-[11px] text-stone-500 font-mono">
                  Mode: <span className="text-cyan-400 font-semibold">{modalMode === 'json' ? 'Raw JSON' : 'Visual Form'}</span>
                </div>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsModelModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-cyan-800 hover:bg-cyan-700 text-cyan-50 font-semibold shadow-md transition cursor-pointer flex items-center space-x-1.5"
                    id="btn-save-model-blueprint"
                  >
                    <Check className="w-4 h-4" />
                    <span>Save Model Blueprint</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch All Models JSON Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-3xl bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl text-stone-100 flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-5 border-b border-stone-800 flex items-center justify-between bg-stone-900 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                  <Code className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-serif font-semibold text-cyan-100">
                    All LLM Model Blueprints (Raw JSON Array)
                  </h3>
                  <p className="text-xs text-stone-400">
                    Inspect, backup, export, or batch-update all model blueprints as a JSON array
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="p-2 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-3 font-sans text-xs">
              <div className="flex items-center justify-between bg-stone-950 p-2.5 rounded-2xl border border-stone-800">
                <span className="text-[11px] text-stone-400">
                  Array of {llmModels.length} LLM Model Blueprints
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleFormatBatchJson}
                    className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 text-[11px] font-mono border border-stone-800 transition cursor-pointer"
                  >
                    Format JSON
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyBatchJson}
                    className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 text-[11px] flex items-center space-x-1 border border-stone-800 transition cursor-pointer"
                  >
                    {batchCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{batchCopied ? 'Copied' : 'Copy All'}</span>
                  </button>
                </div>
              </div>

              <textarea
                spellCheck={false}
                value={batchJsonText}
                onChange={(e) => {
                  setBatchJsonText(e.target.value);
                  try {
                    const p = JSON.parse(e.target.value);
                    if (!Array.isArray(p)) {
                      setBatchJsonError('Root must be an array: [ { ... } ]');
                    } else {
                      setBatchJsonError(null);
                    }
                  } catch (err: any) {
                    setBatchJsonError(err.message);
                  }
                }}
                className="w-full h-96 p-4 rounded-2xl bg-stone-950 border border-stone-800 text-cyan-200 font-mono text-xs leading-relaxed focus:outline-none focus:border-cyan-600 shadow-inner"
              />

              {batchJsonError ? (
                <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="font-mono text-[11px]">{batchJsonError}</span>
                </div>
              ) : (
                <div className="p-2 px-3 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-[11px] flex items-center space-x-1.5 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Valid JSON array format ready to apply</span>
                </div>
              )}

              <div className="pt-3 flex justify-end space-x-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveBatchJson}
                  className="px-5 py-2 rounded-xl bg-cyan-800 hover:bg-cyan-700 text-cyan-50 font-semibold shadow-md transition cursor-pointer"
                  id="btn-save-batch-json"
                >
                  Save All Models
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
