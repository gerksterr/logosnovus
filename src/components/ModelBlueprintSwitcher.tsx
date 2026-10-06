import React, { useState, useRef, useEffect } from 'react';
import { Cpu, ChevronDown, Check, Sparkles, ExternalLink, Globe } from 'lucide-react';
import { LLMModelBlueprint, LLMConfig } from '../types';

interface ModelBlueprintSwitcherProps {
  llmModelBlueprints: LLMModelBlueprint[];
  currentConfig?: LLMConfig;
  onSelectModelBlueprint: (model: LLMModelBlueprint) => void;
  className?: string;
  variant?: 'topbar' | 'reader' | 'sheet' | 'calque' | 'compact' | 'full';
}

export const ModelBlueprintSwitcher: React.FC<ModelBlueprintSwitcherProps> = ({
  llmModelBlueprints = [],
  currentConfig,
  onSelectModelBlueprint,
  className = '',
  variant = 'topbar',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Find active model blueprint matching currentConfig
  const activeModel =
    llmModelBlueprints.find(
      (m) =>
        currentConfig &&
        m.modelName === currentConfig.modelName &&
        (m.provider === currentConfig.provider || (!m.provider && !currentConfig.provider))
    ) ||
    llmModelBlueprints.find(
      (m) => currentConfig && m.provider === currentConfig.provider && currentConfig.provider === 'web-assist'
    ) ||
    llmModelBlueprints.find((m) => m.isDefault) ||
    llmModelBlueprints[0];

  const displayName = activeModel
    ? activeModel.name || activeModel.modelName
    : currentConfig?.modelName || 'Gemini 3.7 Flash';

  const displayPath = activeModel?.modelName || currentConfig?.modelName || '';

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center space-x-1.5 rounded-xl text-xs font-medium transition cursor-pointer border ${
          variant === 'topbar'
            ? 'px-2.5 py-1.5 bg-stone-900/90 hover:bg-stone-800 text-stone-200 border-stone-700/80 shadow-xs'
            : variant === 'reader'
            ? 'px-2.5 py-1.5 bg-stone-950 hover:bg-stone-900 text-stone-200 border-stone-800 shadow-xs'
            : variant === 'sheet' || variant === 'compact'
            ? 'px-2 py-0.5 bg-stone-800/80 hover:bg-stone-800 text-cyan-200 border-cyan-800/50 shadow-xs'
            : 'px-3 py-2 bg-stone-950 border-stone-800 hover:border-cyan-700/60 text-stone-200 w-full justify-between'
        }`}
        title={`Active LLM Model Blueprint: ${displayName} (${displayPath})`}
        id={`btn-model-switcher-${variant}`}
      >
        <div className="flex items-center space-x-1.5 truncate">
          {activeModel?.provider === 'web-assist' ? (
            <Globe className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          ) : (
            <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          )}
          <span className="truncate max-w-[140px] sm:max-w-[180px] font-sans">
            {displayName}
          </span>
          {displayPath && displayPath !== displayName && (
            <span className="hidden md:inline font-mono text-[10px] text-stone-400 truncate max-w-[110px]">
              ({displayPath})
            </span>
          )}
        </div>
        <ChevronDown className="w-3 h-3 text-stone-400 shrink-0" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-72 sm:w-80 bg-stone-950 border border-stone-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in-50 zoom-in-95 duration-150">
          <div className="px-2 py-1.5 border-b border-stone-800/80 flex items-center justify-between text-[11px]">
            <span className="font-semibold text-stone-300 flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Active LLM Model Blueprints</span>
            </span>
            <span className="text-[10px] text-stone-500 font-mono">
              {llmModelBlueprints.length} configured
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 p-1">
            {llmModelBlueprints.length === 0 ? (
              <div className="p-3 text-center text-stone-500 text-xs">
                No model blueprints found.
              </div>
            ) : (
              llmModelBlueprints.map((model) => {
                const isSelected =
                  activeModel?.id === model.id ||
                  (currentConfig &&
                    currentConfig.modelName === model.modelName &&
                    currentConfig.provider === model.provider);

                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onSelectModelBlueprint(model);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl text-xs flex flex-col space-y-1 transition cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/70 text-cyan-100 border border-cyan-700/60 shadow-xs'
                        : 'hover:bg-stone-900 text-stone-300 hover:text-stone-100 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 truncate">
                        {model.provider === 'web-assist' ? (
                          <Globe className="w-3 h-3 text-purple-400 shrink-0" />
                        ) : null}
                        <span className="font-semibold truncate">{model.name}</span>
                      </div>
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-1" />
                      ) : (
                        <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded border ${
                          model.provider === 'web-assist'
                            ? 'bg-purple-950 text-purple-300 border-purple-800'
                            : 'bg-stone-900 text-stone-400 border-stone-800'
                        }`}>
                          {model.provider === 'openrouter'
                            ? 'OpenRouter'
                            : model.provider === 'web-assist'
                            ? 'Web Assist'
                            : model.provider}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 text-[10px] font-mono text-stone-400 truncate">
                      <span className="text-cyan-300/80 truncate">
                        {model.modelName}
                      </span>
                      {model.temperature !== undefined && (
                        <span className="text-stone-500 shrink-0">
                          temp: {model.temperature}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
