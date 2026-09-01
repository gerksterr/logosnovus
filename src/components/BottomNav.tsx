import React from 'react';
import { Library, BookOpen, Sparkles, Settings, Zap } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'library' | 'reader' | 'playground' | 'blueprints' | 'settings';
  setActiveTab: (tab: 'library' | 'reader' | 'playground' | 'blueprints' | 'settings') => void;
  hasActiveText: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  hasActiveText,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-amber-950/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-amber-900/40 dark:border-stone-800 text-amber-200 shadow-lg md:hidden">
      <div className="max-w-md mx-auto grid grid-cols-5 h-16">
        {/* Library Tab */}
        <button
          onClick={() => setActiveTab('library')}
          className={`flex flex-col items-center justify-center space-y-1 transition ${
            activeTab === 'library'
              ? 'text-amber-300 font-medium'
              : 'text-amber-400/60 hover:text-amber-200'
          }`}
          id="btn-nav-library"
        >
          <div className={`p-1 rounded-full ${activeTab === 'library' ? 'bg-amber-900/60 dark:bg-stone-800' : ''}`}>
            <Library className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight">Library</span>
        </button>

        {/* Reader Tab */}
        <button
          onClick={() => setActiveTab('reader')}
          disabled={!hasActiveText}
          className={`flex flex-col items-center justify-center space-y-1 transition ${
            !hasActiveText
              ? 'opacity-40 cursor-not-allowed text-amber-400/40'
              : activeTab === 'reader'
              ? 'text-amber-300 font-medium'
              : 'text-amber-400/60 hover:text-amber-200'
          }`}
          id="btn-nav-reader"
        >
          <div className={`p-1 rounded-full relative ${activeTab === 'reader' ? 'bg-amber-900/60 dark:bg-stone-800' : ''}`}>
            <BookOpen className="w-5 h-5" />
            {hasActiveText && activeTab !== 'reader' && (
              <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </div>
          <span className="text-[10px] tracking-tight">Reader</span>
        </button>

        {/* Playground Tab */}
        <button
          onClick={() => setActiveTab('playground')}
          className={`flex flex-col items-center justify-center space-y-1 transition ${
            activeTab === 'playground'
              ? 'text-amber-300 font-medium'
              : 'text-amber-400/60 hover:text-amber-200'
          }`}
          id="btn-nav-playground"
        >
          <div className={`p-1 rounded-full ${activeTab === 'playground' ? 'bg-purple-900/60 dark:bg-stone-800' : ''}`}>
            <Zap className="w-5 h-5 text-purple-400" />
          </div>
          <span className="text-[10px] tracking-tight">Playground</span>
        </button>

        {/* Blueprints Tab */}
        <button
          onClick={() => setActiveTab('blueprints')}
          className={`flex flex-col items-center justify-center space-y-1 transition ${
            activeTab === 'blueprints'
              ? 'text-amber-300 font-medium'
              : 'text-amber-400/60 hover:text-amber-200'
          }`}
          id="btn-nav-blueprints"
        >
          <div className={`p-1 rounded-full ${activeTab === 'blueprints' ? 'bg-amber-900/60 dark:bg-stone-800' : ''}`}>
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight">Blueprints</span>
        </button>

        {/* Settings Tab */}
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center space-y-1 transition ${
            activeTab === 'settings'
              ? 'text-amber-300 font-medium'
              : 'text-amber-400/60 hover:text-amber-200'
          }`}
          id="btn-nav-settings"
        >
          <div className={`p-1 rounded-full ${activeTab === 'settings' ? 'bg-amber-900/60 dark:bg-stone-800' : ''}`}>
            <Settings className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight">LLMs</span>
        </button>
      </div>
    </nav>
  );
};
