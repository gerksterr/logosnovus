import React, { useState } from 'react';
import { 
  Settings, 
  Cpu, 
  Key, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Sparkles, 
  Sliders, 
  ShieldCheck, 
  Globe, 
  Trash2,
  FileJson,
  Plus,
  Server,
  Edit2,
  ChevronRight,
  HelpCircle,
  Cloud,
  Laptop,
  Check
} from 'lucide-react';
import { User } from 'firebase/auth';
import { LLMConfig, LLMProviderType, ReaderSettings, CustomProviderConfig } from '../types';
import { testLLMConnection, getDefaultRequestJsonTemplate } from '../services/llmService';

interface SettingsViewProps {
  llmConfig: LLMConfig;
  onSaveLLMConfig: (config: LLMConfig) => void;
  readerSettings: ReaderSettings;
  onSaveReaderSettings: (settings: ReaderSettings) => void;
  onResetAllData: () => void;
  currentUser?: User | null;
  onOpenCloudSyncModal?: () => void;
  isCloudSynced?: boolean;
}

const PROVIDER_PRESETS: { name: string; baseUrl: string; defaultModel: string; note: string }[] = [
  {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1/chat/completions',
    defaultModel: 'llama3.3',
    note: 'Runs completely offline on your local machine. No API key needed.',
  },
  {
    name: 'LM Studio (Local)',
    baseUrl: 'http://localhost:1234/v1/chat/completions',
    defaultModel: 'local-model',
    note: 'Local OpenAI-compatible inference server. No API key needed.',
  },
  {
    name: 'DeepSeek API',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    note: 'Official DeepSeek V3 and R1 OpenAI-compatible endpoint.',
  },
  {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1/chat/completions',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    note: 'Fast cloud hosting for open-weights models.',
  },
  {
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    defaultModel: 'mistral-large-latest',
    note: 'Official Mistral Large & Small OpenAI-compatible endpoint.',
  },
  {
    name: 'vLLM / LocalAI',
    baseUrl: 'http://localhost:8000/v1/chat/completions',
    defaultModel: 'default',
    note: 'Self-hosted vLLM or LocalAI containerized endpoint.',
  },
  {
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    defaultModel: 'grok-2-latest',
    note: 'Official xAI Grok OpenAI-compatible endpoint.',
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  llmConfig,
  onSaveLLMConfig,
  readerSettings,
  onSaveReaderSettings,
  onResetAllData,
  currentUser,
  onOpenCloudSyncModal,
  isCloudSynced = false,
}) => {
  const [provider, setProvider] = useState<LLMProviderType>(llmConfig.provider || 'built-in-gemini');
  const [modelName, setModelName] = useState(llmConfig.modelName || 'gemini-3.7-flash');
  const [customApiKey, setCustomApiKey] = useState(llmConfig.customApiKey || '');
  const [customBaseUrl, setCustomBaseUrl] = useState(llmConfig.customBaseUrl || '');
  const [requestJsonTemplate, setRequestJsonTemplate] = useState<string>(
    llmConfig.requestJsonTemplate || getDefaultRequestJsonTemplate(llmConfig.provider || 'built-in-gemini', llmConfig.modelName || 'gemini-3.7-flash')
  );
  const [customProviders, setCustomProviders] = useState<CustomProviderConfig[]>(
    llmConfig.customProviders || []
  );

  // New/Edit Provider Modal or Drawer Form State
  const [isAddingCustomProvider, setIsAddingCustomProvider] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [customProviderForm, setCustomProviderForm] = useState<{
    name: string;
    baseUrl: string;
    apiKey: string;
    defaultModel: string;
    requestJsonTemplate: string;
  }>({
    name: '',
    baseUrl: '',
    apiKey: '',
    defaultModel: '',
    requestJsonTemplate: '',
  });

  const [testStatus, setTestStatus] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [saveBanner, setSaveBanner] = useState(false);

  // Sync state when provider changes
  const handleProviderSelect = (p: LLMProviderType) => {
    setProvider(p);
    setTestStatus(null);

    let defaultModel = 'gemini-3.7-flash';
    switch (p) {
      case 'built-in-gemini':
        defaultModel = 'gemini-3.7-flash';
        break;
      case 'custom-gemini':
        defaultModel = 'gemini-3.7-flash';
        break;
      case 'groq':
        defaultModel = 'llama-3.3-70b-versatile';
        break;
      case 'openrouter':
        defaultModel = 'meta-llama/llama-3.3-70b-instruct';
        break;
      case 'custom-openai':
        defaultModel = 'gpt-4o-mini';
        if (!customBaseUrl) setCustomBaseUrl('https://api.openai.com/v1/chat/completions');
        break;
      default: {
        // User custom provider
        const matched = customProviders.find((cp) => cp.id === p);
        if (matched) {
          defaultModel = matched.defaultModel || 'gpt-4o-mini';
          setCustomBaseUrl(matched.baseUrl);
          if (matched.apiKey) setCustomApiKey(matched.apiKey);
          if (matched.requestJsonTemplate) {
            setRequestJsonTemplate(matched.requestJsonTemplate);
          }
        }
      }
    }
    setModelName(defaultModel);
    if (p !== 'custom-openai' && !p.startsWith('custom-prov-')) {
      setRequestJsonTemplate(getDefaultRequestJsonTemplate(p, defaultModel));
    }
  };

  const handleSaveLLM = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const updated: LLMConfig = {
      provider,
      modelName,
      customApiKey: customApiKey.trim() || undefined,
      customBaseUrl: customBaseUrl.trim() || undefined,
      requestJsonTemplate: requestJsonTemplate.trim() || undefined,
      customProviders,
      activeCustomProviderId: customProviders.some((cp) => cp.id === provider) ? provider : undefined,
    };
    onSaveLLMConfig(updated);
    setSaveBanner(true);
    setTimeout(() => setSaveBanner(false), 4000);
  };

  const handleTestConnection = async () => {
    const configToTest: LLMConfig = {
      provider,
      modelName,
      customApiKey: customApiKey.trim() || undefined,
      customBaseUrl: customBaseUrl.trim() || undefined,
      requestJsonTemplate: requestJsonTemplate.trim() || undefined,
      customProviders,
      activeCustomProviderId: customProviders.some((cp) => cp.id === provider) ? provider : undefined,
    };

    setIsTesting(true);
    setTestStatus(null);

    const res = await testLLMConnection(configToTest);
    setIsTesting(false);
    setTestStatus({
      tested: true,
      success: res.success,
      message: res.message,
    });
  };

  // Open Add/Edit Custom Provider Modal
  const handleOpenAddCustomProvider = (providerToEdit?: CustomProviderConfig) => {
    if (providerToEdit) {
      setEditingProviderId(providerToEdit.id);
      setCustomProviderForm({
        name: providerToEdit.name,
        baseUrl: providerToEdit.baseUrl,
        apiKey: providerToEdit.apiKey || '',
        defaultModel: providerToEdit.defaultModel,
        requestJsonTemplate: providerToEdit.requestJsonTemplate || getDefaultRequestJsonTemplate('custom-openai', providerToEdit.defaultModel),
      });
    } else {
      setEditingProviderId(null);
      setCustomProviderForm({
        name: '',
        baseUrl: 'http://localhost:11434/v1/chat/completions',
        apiKey: '',
        defaultModel: 'llama3.3',
        requestJsonTemplate: getDefaultRequestJsonTemplate('custom-openai', 'llama3.3'),
      });
    }
    setIsAddingCustomProvider(true);
  };

  // Save Custom Provider from Modal
  const handleSaveCustomProviderModal = () => {
    if (!customProviderForm.name.trim()) {
      alert('Please enter a name for your custom provider.');
      return;
    }
    if (!customProviderForm.baseUrl.trim()) {
      alert('Please enter a base URL / endpoint URL.');
      return;
    }

    const providerId = editingProviderId || `custom-prov-${Date.now()}`;
    const newConfig: CustomProviderConfig = {
      id: providerId,
      name: customProviderForm.name.trim(),
      baseUrl: customProviderForm.baseUrl.trim(),
      apiKey: customProviderForm.apiKey.trim() || undefined,
      defaultModel: customProviderForm.defaultModel.trim() || 'default',
      requestJsonTemplate: customProviderForm.requestJsonTemplate.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    let updatedList = [...customProviders];
    if (editingProviderId) {
      updatedList = updatedList.map((cp) => (cp.id === editingProviderId ? newConfig : cp));
    } else {
      updatedList.push(newConfig);
    }

    setCustomProviders(updatedList);
    setIsAddingCustomProvider(false);

    // Automatically select the newly created / edited provider
    setProvider(providerId);
    setModelName(newConfig.defaultModel);
    setCustomBaseUrl(newConfig.baseUrl);
    setCustomApiKey(newConfig.apiKey || '');
    if (newConfig.requestJsonTemplate) {
      setRequestJsonTemplate(newConfig.requestJsonTemplate);
    }

    // Persist immediately
    const updatedLLM: LLMConfig = {
      provider: providerId,
      modelName: newConfig.defaultModel,
      customApiKey: newConfig.apiKey,
      customBaseUrl: newConfig.baseUrl,
      requestJsonTemplate: newConfig.requestJsonTemplate,
      customProviders: updatedList,
      activeCustomProviderId: providerId,
    };
    onSaveLLMConfig(updatedLLM);
  };

  const handleDeleteCustomProvider = (id: string) => {
    if (!confirm('Are you sure you want to delete this custom provider?')) return;
    const updated = customProviders.filter((cp) => cp.id !== id);
    setCustomProviders(updated);
    if (provider === id) {
      handleProviderSelect('built-in-gemini');
    }
    const updatedLLM: LLMConfig = {
      provider: provider === id ? 'built-in-gemini' : provider,
      modelName: provider === id ? 'gemini-3.7-flash' : modelName,
      customApiKey,
      customBaseUrl,
      requestJsonTemplate,
      customProviders: updated,
    };
    onSaveLLMConfig(updatedLLM);
  };

  const handleApplyPreset = (preset: typeof PROVIDER_PRESETS[0]) => {
    setCustomProviderForm({
      ...customProviderForm,
      name: preset.name,
      baseUrl: preset.baseUrl,
      defaultModel: preset.defaultModel,
      requestJsonTemplate: getDefaultRequestJsonTemplate('custom-openai', preset.defaultModel),
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-28 space-y-6">
      {/* Title Header */}
      <div className="border-b border-stone-800 pb-4 space-y-1">
        <h2 className="text-xl font-serif font-bold text-amber-100 flex items-center space-x-2">
          <Settings className="w-5 h-5 text-amber-400" />
          <span>LLM Provider & Model Settings</span>
        </h2>
        <p className="text-xs text-stone-400">
          Switch between built-in Gemini (defaulting to <strong>Gemini 3.7 Flash</strong>), custom Gemini keys, Groq, OpenRouter, or set up new custom providers with custom base URLs and full OpenAI-compatible payloads.
        </p>
      </div>

      {/* Google Cloud Account & Sync Section */}
      <div className="p-5 rounded-3xl bg-stone-900 border border-stone-800 shadow-md space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-amber-950/80 text-amber-400 border border-amber-800/60">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-stone-100 flex items-center space-x-2">
                <span>Google Cloud Synchronization</span>
                {currentUser && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-sans">
                    Connected
                  </span>
                )}
              </h3>
              <p className="text-xs text-stone-400">
                {currentUser 
                  ? `Signed in as ${currentUser.email}. Texts, notes & configs sync across phone & desktop.`
                  : 'Sign in with Google to sync texts, notes, and custom blueprints across devices with 1 click.'}
              </p>
            </div>
          </div>

          {onOpenCloudSyncModal && (
            <button
              type="button"
              onClick={onOpenCloudSyncModal}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 shadow-md transition shrink-0 ${
                currentUser
                  ? 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-700/80'
                  : 'bg-white hover:bg-stone-100 text-stone-900'
              }`}
              id="btn-settings-open-cloud-sync"
            >
              <Cloud className="w-4 h-4" />
              <span>{currentUser ? 'Manage Cloud Sync' : 'Sign in with Google'}</span>
            </button>
          )}
        </div>
      </div>

      {saveBanner && (
        <div className="p-3 rounded-2xl bg-emerald-950/80 border border-emerald-700/80 text-emerald-200 text-xs flex items-center space-x-2 animate-fade-in shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>LLM Provider, Model, and Custom Base URL settings saved successfully!</span>
        </div>
      )}

      {/* Provider Selector Cards */}
      <form onSubmit={handleSaveLLM} className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-amber-200 uppercase tracking-wider">
              Select LLM Provider
            </label>
            <button
              type="button"
              onClick={() => handleOpenAddCustomProvider()}
              className="text-xs bg-amber-900/60 hover:bg-amber-800/80 text-amber-200 border border-amber-700/70 px-2.5 py-1 rounded-xl flex items-center space-x-1.5 transition font-medium shadow-xs"
              id="btn-add-new-provider"
            >
              <Plus className="w-3.5 h-3.5 text-amber-300" />
              <span>Add Custom Provider</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1. Built-in Gemini (Default: Gemini 3.7 Flash) */}
            <div
              onClick={() => handleProviderSelect('built-in-gemini')}
              className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between ${
                provider === 'built-in-gemini'
                  ? 'bg-amber-950/80 border-amber-600 ring-2 ring-amber-500/50'
                  : 'bg-stone-900 border-stone-800 hover:border-stone-700'
              }`}
              id="provider-card-built-in-gemini"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Built-In Gemini</span>
                  </span>
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-800 font-bold">
                    Gemini 3.7 Flash (Default)
                  </span>
                </div>
                <h3 className="text-sm font-serif font-bold text-amber-100 mt-1">
                  Server-Side Gemini
                </h3>
                <p className="text-[11px] text-stone-400 mt-1 leading-relaxed">
                  Default zero-config AI using the latest applicable Google Gemini 3.7 Flash model.
                </p>
              </div>
            </div>

            {/* 2. Custom Gemini Key */}
            <div
              onClick={() => handleProviderSelect('custom-gemini')}
              className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between ${
                provider === 'custom-gemini'
                  ? 'bg-amber-950/80 border-amber-600 ring-2 ring-amber-500/50'
                  : 'bg-stone-900 border-stone-800 hover:border-stone-700'
              }`}
              id="provider-card-custom-gemini"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center space-x-1">
                    <Key className="w-3.5 h-3.5" />
                    <span>Custom Gemini Key</span>
                  </span>
                </div>
                <h3 className="text-sm font-serif font-bold text-amber-100 mt-1">
                  Google Gemini Direct API
                </h3>
                <p className="text-[11px] text-stone-400 mt-1 leading-relaxed">
                  Direct client streaming using your personal Google AI Studio API Key (supports Gemini 3.7 Flash).
                </p>
              </div>
            </div>

            {/* 3. Groq Free Models */}
            <div
              onClick={() => handleProviderSelect('groq')}
              className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between ${
                provider === 'groq'
                  ? 'bg-amber-950/80 border-amber-600 ring-2 ring-amber-500/50'
                  : 'bg-stone-900 border-stone-800 hover:border-stone-700'
              }`}
              id="provider-card-groq"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center space-x-1">
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Groq Fast Models</span>
                  </span>
                  <span className="text-[10px] bg-amber-900/60 text-amber-300 px-2 py-0.5 rounded-full border border-amber-700">
                    High Speed
                  </span>
                </div>
                <h3 className="text-sm font-serif font-bold text-amber-100 mt-1">
                  Groq Llama 3.3 & Mixtral
                </h3>
                <p className="text-[11px] text-stone-400 mt-1 leading-relaxed">
                  Ultra-fast response speeds using Groq cloud API key.
                </p>
              </div>
            </div>

            {/* 4. OpenRouter Free & Paid Models */}
            <div
              onClick={() => handleProviderSelect('openrouter')}
              className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between ${
                provider === 'openrouter'
                  ? 'bg-amber-950/80 border-amber-600 ring-2 ring-amber-500/50'
                  : 'bg-stone-900 border-stone-800 hover:border-stone-700'
              }`}
              id="provider-card-openrouter"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center space-x-1">
                    <Globe className="w-3.5 h-3.5" />
                    <span>OpenRouter</span>
                  </span>
                  <span className="text-[10px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded-full border border-purple-800">
                    Multi-Model
                  </span>
                </div>
                <h3 className="text-sm font-serif font-bold text-amber-100 mt-1">
                  OpenRouter Multimodel
                </h3>
                <p className="text-[11px] text-stone-400 mt-1 leading-relaxed">
                  Access DeepSeek R1, Claude, Llama 3.3, and any OpenAI-compatible models.
                </p>
              </div>
            </div>

            {/* 5. Custom OpenAI / Generic Provider */}
            <div
              onClick={() => handleProviderSelect('custom-openai')}
              className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between ${
                provider === 'custom-openai'
                  ? 'bg-amber-950/80 border-amber-600 ring-2 ring-amber-500/50'
                  : 'bg-stone-900 border-stone-800 hover:border-stone-700'
              }`}
              id="provider-card-custom-openai"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center space-x-1">
                    <Server className="w-3.5 h-3.5" />
                    <span>Custom OpenAI Endpoint</span>
                  </span>
                  <span className="text-[10px] bg-blue-950 text-blue-300 px-2 py-0.5 rounded-full border border-blue-800">
                    Custom URL
                  </span>
                </div>
                <h3 className="text-sm font-serif font-bold text-amber-100 mt-1">
                  Generic OpenAI Compatible
                </h3>
                <p className="text-[11px] text-stone-400 mt-1 leading-relaxed">
                  Configure any custom base URL, endpoint URL, and request payload structure.
                </p>
              </div>
            </div>

            {/* 6. User-Saved Custom Providers */}
            {customProviders.map((cp) => {
              const isSelected = provider === cp.id;
              return (
                <div
                  key={cp.id}
                  onClick={() => handleProviderSelect(cp.id)}
                  className={`p-4 rounded-2xl border cursor-pointer transition flex flex-col justify-between ${
                    isSelected
                      ? 'bg-amber-950/80 border-amber-600 ring-2 ring-amber-500/50'
                      : 'bg-stone-900 border-stone-800 hover:border-stone-700'
                  }`}
                  id={`provider-card-${cp.id}`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center space-x-1">
                        <Server className="w-3.5 h-3.5" />
                        <span>{cp.name}</span>
                      </span>
                      <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleOpenAddCustomProvider(cp)}
                          className="p-1 rounded-md text-stone-400 hover:text-amber-200 hover:bg-stone-800"
                          title="Edit Provider"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomProvider(cp.id)}
                          className="p-1 rounded-md text-stone-400 hover:text-red-400 hover:bg-stone-800"
                          title="Delete Provider"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <h3 className="text-sm font-serif font-bold text-amber-100 mt-1 truncate">
                      {cp.defaultModel || 'Custom Model'}
                    </h3>
                    <p className="text-[10px] font-mono text-stone-400 mt-1 truncate">
                      {cp.baseUrl}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Configuration Inputs for Active Provider */}
        <div className="p-5 rounded-3xl bg-stone-900 border border-stone-800 space-y-4 text-xs font-sans">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-serif font-semibold text-amber-100 flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>
                Configure{' '}
                {customProviders.find((cp) => cp.id === provider)?.name ||
                  provider.toUpperCase().replace('-', ' ')}
              </span>
            </h3>
            <span className="text-[10px] text-amber-300/80 bg-stone-950 px-2 py-0.5 rounded-full border border-stone-800 font-mono">
              Active Provider
            </span>
          </div>

          {/* Model Name Selector / Custom Model Path Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-stone-300 font-medium">Model Path / Identifier</label>
              <span className="text-[10px] text-stone-400">Type any custom model ID or choose preset</span>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                placeholder={
                  provider === 'built-in-gemini' || provider === 'custom-gemini'
                    ? 'e.g. gemini-3.7-flash or gemini-3.1-pro-preview'
                    : provider === 'openrouter'
                    ? 'e.g. deepseek/deepseek-r1 or meta-llama/llama-3.3-70b-instruct'
                    : provider === 'groq'
                    ? 'e.g. llama-3.3-70b-versatile or mixtral-8x7b-32768'
                    : 'e.g. gpt-4o-mini, llama3.3, or deepseek-chat'
                }
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-amber-200 text-xs font-mono focus:outline-hidden focus:border-amber-600"
                id="input-model-name-custom"
              />

              {/* Quick Model Presets Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-stone-500 font-sans">Presets:</span>

                {/* Built-in Gemini Presets */}
                {provider === 'built-in-gemini' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setModelName('gemini-3.7-flash')}
                      className="px-2 py-0.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 text-amber-200 font-mono font-medium"
                    >
                      gemini-3.7-flash (Default)
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('gemini-3.1-pro-preview')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      gemini-3.1-pro-preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('gemini-2.5-flash')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      gemini-2.5-flash
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('gemini-2.5-pro')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      gemini-2.5-pro
                    </button>
                  </>
                )}

                {/* Custom Gemini Presets */}
                {provider === 'custom-gemini' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setModelName('gemini-3.7-flash')}
                      className="px-2 py-0.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 text-amber-200 font-mono font-medium"
                    >
                      gemini-3.7-flash (Default)
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('gemini-3.1-pro-preview')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      gemini-3.1-pro-preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('gemini-2.5-flash')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      gemini-2.5-flash
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('gemini-2.5-pro')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      gemini-2.5-pro
                    </button>
                  </>
                )}

                {provider === 'openrouter' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setModelName('deepseek/deepseek-r1')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      deepseek/deepseek-r1
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('meta-llama/llama-3.3-70b-instruct')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      llama-3.3-70b
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('google/gemini-2.5-flash')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      gemini-2.5-flash
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('anthropic/claude-3.5-sonnet')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      claude-3.5-sonnet
                    </button>
                  </>
                )}

                {provider === 'groq' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setModelName('llama-3.3-70b-versatile')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      llama-3.3-70b-versatile
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('mixtral-8x7b-32768')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      mixtral-8x7b-32768
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('gemma2-9b-it')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      gemma2-9b-it
                    </button>
                  </>
                )}

                {(provider === 'custom-openai' || provider.startsWith('custom-prov-')) && (
                  <>
                    <button
                      type="button"
                      onClick={() => setModelName('gpt-4o-mini')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      gpt-4o-mini
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('llama3.3')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      llama3.3 (Local)
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('deepseek-chat')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      deepseek-chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelName('mistral-large-latest')}
                      className="px-2 py-0.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono"
                    >
                      mistral-large
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Custom Base URL (Visible for custom-openai and user custom providers) */}
          {(provider === 'custom-openai' || provider.startsWith('custom-prov-')) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-stone-300 font-medium flex items-center space-x-1">
                  <span>Custom Base URL / API Endpoint</span>
                </label>
                <span className="text-[10px] text-amber-400 font-mono">
                  Full endpoint (e.g. /chat/completions)
                </span>
              </div>
              <input
                type="text"
                placeholder="http://localhost:11434/v1/chat/completions or https://api.openai.com/v1/chat/completions"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-amber-200 text-xs font-mono"
                id="input-custom-base-url"
              />
              <p className="text-[10px] text-stone-400">
                You can connect to local servers (e.g. Ollama, LM Studio, vLLM) or any custom OpenAI-compatible cloud proxy.
              </p>
            </div>
          )}

          {/* Custom API Key input if not built-in */}
          {provider !== 'built-in-gemini' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-stone-300 font-medium">
                  {provider.toUpperCase()} API Key
                </label>
                {(provider === 'custom-openai' || provider.startsWith('custom-prov-')) && (
                  <span className="text-[10px] text-stone-400">Optional for local servers (Ollama / LM Studio)</span>
                )}
              </div>
              <input
                type="password"
                placeholder="Paste API Key here..."
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 text-xs font-mono"
                id="input-custom-api-key"
              />
            </div>
          )}

          {/* Template-Based JSON Call Builder (Full OpenAI Compatible Payload) */}
          <div className="p-4 rounded-2xl bg-stone-950 border border-stone-800 space-y-3 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileJson className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-200 uppercase tracking-wider">
                  Full Request JSON Payload & Template Builder
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRequestJsonTemplate(getDefaultRequestJsonTemplate(provider, modelName))}
                className="text-[10px] text-amber-400 hover:underline flex items-center space-x-1"
                id="btn-reset-json-template"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset to Standard Payload</span>
              </button>
            </div>

            <p className="text-[11px] text-stone-400 leading-relaxed">
              Customize the full JSON payload structure sent to the provider. Dynamic variables like <code className="text-amber-300 font-mono">{'{prompt}'}</code>, <code className="text-amber-300 font-mono">{'{model}'}</code>, <code className="text-amber-300 font-mono">{'{systemInstruction}'}</code>, and <code className="text-amber-300 font-mono">{'{targetText}'}</code> will be substituted at runtime.
            </p>

            <div className="space-y-1.5">
              <textarea
                rows={9}
                value={requestJsonTemplate}
                onChange={(e) => setRequestJsonTemplate(e.target.value)}
                className="w-full p-3 rounded-xl bg-stone-900 border border-amber-900/40 text-amber-200 text-xs font-mono leading-relaxed focus:outline-hidden focus:border-amber-600"
                id="textarea-request-json-template"
                spellCheck={false}
              />

              {/* Quick Parameter Inserter Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="text-stone-500 font-sans">Quick Placeholders:</span>
                <button
                  type="button"
                  onClick={() => setRequestJsonTemplate((prev) => prev + ' "{prompt}"')}
                  className="px-2 py-0.5 rounded-md bg-stone-800 hover:bg-amber-950 text-amber-300 font-mono border border-stone-700"
                >
                  + {'{prompt}'}
                </button>
                <button
                  type="button"
                  onClick={() => setRequestJsonTemplate((prev) => prev + ' "{model}"')}
                  className="px-2 py-0.5 rounded-md bg-stone-800 hover:bg-amber-950 text-amber-300 font-mono border border-stone-700"
                >
                  + {'{model}'}
                </button>
                <button
                  type="button"
                  onClick={() => setRequestJsonTemplate((prev) => prev + ' "{systemInstruction}"')}
                  className="px-2 py-0.5 rounded-md bg-stone-800 hover:bg-amber-950 text-amber-300 font-mono border border-stone-700"
                >
                  + {'{systemInstruction}'}
                </button>
                <button
                  type="button"
                  onClick={() => setRequestJsonTemplate((prev) => prev + ' "{targetText}"')}
                  className="px-2 py-0.5 rounded-md bg-stone-800 hover:bg-amber-950 text-amber-300 font-mono border border-stone-700"
                >
                  + {'{targetText}'}
                </button>
              </div>
            </div>
          </div>

          {/* Connection Test Status Display */}
          {testStatus && (
            <div className={`p-3 rounded-xl border flex items-center space-x-2.5 text-xs ${
              testStatus.success
                ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-200'
                : 'bg-red-950/60 border-red-800/80 text-red-200'
            }`}>
              {testStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span className="leading-tight">{testStatus.message}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between space-x-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium flex items-center space-x-1.5 transition"
              id="btn-test-llm-connection"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'Testing Provider...' : 'Test Connection'}</span>
            </button>

            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-amber-50 text-xs font-medium shadow-md transition"
              id="btn-save-llm-settings"
            >
              Save LLM Settings
            </button>
          </div>
        </div>
      </form>

      {/* Reader & Typography Settings */}
      <div className="p-5 rounded-3xl bg-stone-900 border border-stone-800 space-y-4 text-xs">
        <h3 className="text-sm font-serif font-semibold text-amber-100 flex items-center space-x-2">
          <Sliders className="w-4 h-4 text-amber-400" />
          <span>Reader & Visual Styling</span>
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-stone-300 font-medium">Font Family</label>
            <select
              value={readerSettings.fontFamily}
              onChange={(e) => onSaveReaderSettings({ ...readerSettings, fontFamily: e.target.value as any })}
              className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-amber-200 text-xs focus:outline-hidden"
              id="select-font-family"
            >
              <option value="serif">Serif (Literary / Classic)</option>
              <option value="sans">Sans-Serif (Clean / Modern)</option>
              <option value="mono">Monospace (Technical / Script)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-stone-300 font-medium">Visual Theme</label>
            <select
              value={readerSettings.theme}
              onChange={(e) => onSaveReaderSettings({ ...readerSettings, theme: e.target.value as any })}
              className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-amber-200 text-xs focus:outline-hidden"
              id="select-reader-theme"
            >
              <option value="parchment">Parchment (Warm Amber)</option>
              <option value="obsidian">Obsidian (Deep Midnight)</option>
              <option value="sepia">Sepia (Antique Paper)</option>
              <option value="emerald">Emerald (Dark Mystic Green)</option>
              <option value="mystic">Mystic (Deep Purple Alchemy)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Data Management Section */}
      <div className="p-5 rounded-3xl bg-stone-900 border border-stone-800 space-y-3 text-xs">
        <h3 className="text-sm font-serif font-semibold text-amber-100 flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <span>Local Storage & Backup</span>
        </h3>
        <p className="text-stone-400 leading-relaxed">
          All foreign symbolic texts, query blueprints, and word annotations are stored locally in your browser.
        </p>

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              if (confirm('Are you sure you want to reset all stored texts and blueprints back to factory default samples?')) {
                onResetAllData();
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800/60 font-medium flex items-center space-x-1.5 transition"
            id="btn-reset-factory-data"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span>Reset Factory Data</span>
          </button>
        </div>
      </div>

      {/* Add / Edit Custom Provider Modal Dialog */}
      {isAddingCustomProvider && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div 
            className="bg-stone-900 border border-stone-800 rounded-3xl p-5 max-w-lg w-full space-y-4 my-8 shadow-2xl animate-fade-in"
          >
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center space-x-2">
                <Server className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-serif font-bold text-amber-100">
                  {editingProviderId ? 'Edit Custom Provider' : 'Set Up New Provider (OpenAI Compatible)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingCustomProvider(false)}
                className="text-stone-400 hover:text-amber-200 p-1"
              >
                ✕
              </button>
            </div>

            {/* Quick Presets Selection */}
            {!editingProviderId && (
              <div className="p-3 bg-stone-950 rounded-2xl border border-stone-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
                    Quick Provider Presets
                  </span>
                  <span className="text-[10px] text-stone-500">Tap to auto-fill</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="px-2.5 py-1 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] border border-stone-700 transition flex items-center space-x-1"
                    >
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 text-xs">
              {/* Provider Name */}
              <div className="space-y-1">
                <label className="text-stone-300 font-medium">Provider Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. Ollama Local, DeepSeek API, Together AI"
                  value={customProviderForm.name}
                  onChange={(e) =>
                    setCustomProviderForm({ ...customProviderForm, name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-amber-100 text-xs focus:outline-hidden focus:border-amber-600"
                  id="modal-input-provider-name"
                />
              </div>

              {/* Base URL */}
              <div className="space-y-1">
                <label className="text-stone-300 font-medium">Base URL / Endpoint URL</label>
                <input
                  type="text"
                  placeholder="http://localhost:11434/v1/chat/completions"
                  value={customProviderForm.baseUrl}
                  onChange={(e) =>
                    setCustomProviderForm({ ...customProviderForm, baseUrl: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-amber-200 font-mono text-xs focus:outline-hidden focus:border-amber-600"
                  id="modal-input-provider-baseurl"
                />
                <p className="text-[10px] text-stone-400">
                  Must point to the full OpenAI-compatible endpoint route (e.g. <code className="text-amber-400">/v1/chat/completions</code>).
                </p>
              </div>

              {/* Default Model */}
              <div className="space-y-1">
                <label className="text-stone-300 font-medium">Default Model Name</label>
                <input
                  type="text"
                  placeholder="e.g. llama3.3, deepseek-chat, qwen2.5-coder"
                  value={customProviderForm.defaultModel}
                  onChange={(e) =>
                    setCustomProviderForm({ ...customProviderForm, defaultModel: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 font-mono text-xs focus:outline-hidden focus:border-amber-600"
                  id="modal-input-provider-model"
                />
              </div>

              {/* API Key */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-stone-300 font-medium">API Key (Bearer Token)</label>
                  <span className="text-[10px] text-stone-500">Optional for local servers</span>
                </div>
                <input
                  type="password"
                  placeholder="Leave empty if local / no auth needed"
                  value={customProviderForm.apiKey}
                  onChange={(e) =>
                    setCustomProviderForm({ ...customProviderForm, apiKey: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 font-mono text-xs focus:outline-hidden focus:border-amber-600"
                  id="modal-input-provider-apikey"
                />
              </div>

              {/* Custom Payload Template */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-stone-300 font-medium">Request Payload JSON Structure</label>
                  <button
                    type="button"
                    onClick={() =>
                      setCustomProviderForm({
                        ...customProviderForm,
                        requestJsonTemplate: getDefaultRequestJsonTemplate(
                          'custom-openai',
                          customProviderForm.defaultModel || 'model'
                        ),
                      })
                    }
                    className="text-[10px] text-amber-400 hover:underline"
                  >
                    Reset Template
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={customProviderForm.requestJsonTemplate}
                  onChange={(e) =>
                    setCustomProviderForm({
                      ...customProviderForm,
                      requestJsonTemplate: e.target.value,
                    })
                  }
                  className="w-full p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-amber-200 font-mono text-[11px] leading-relaxed"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-stone-800">
              <button
                type="button"
                onClick={() => setIsAddingCustomProvider(false)}
                className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomProviderModal}
                className="px-5 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-amber-50 text-xs font-medium shadow-md"
                id="btn-confirm-save-custom-provider"
              >
                {editingProviderId ? 'Save Changes' : 'Add Provider'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
