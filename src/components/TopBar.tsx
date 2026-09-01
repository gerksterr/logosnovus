import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Sparkles, 
  SlidersHorizontal, 
  Settings, 
  ChevronLeft, 
  Moon, 
  Sun,
  Library,
  Feather,
  WifiOff,
  Cloud,
  Zap,
  Check
} from 'lucide-react';
import { User } from 'firebase/auth';
import { ReaderSettings } from '../types';

interface TopBarProps {
  activeTab: 'library' | 'reader' | 'playground' | 'blueprints' | 'settings';
  setActiveTab: (tab: 'library' | 'reader' | 'playground' | 'blueprints' | 'settings') => void;
  activeTextTitle?: string;
  hasActiveText: boolean;
  readerSettings: ReaderSettings;
  onUpdateReaderSettings: (settings: ReaderSettings) => void;
  onOpenReaderSettingsModal?: () => void;
  currentUser: User | null;
  onOpenCloudSyncModal: () => void;
  isCloudSyncing?: boolean;
  lastSyncedTimestamp?: string | null;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  activeTextTitle,
  hasActiveText,
  readerSettings,
  onUpdateReaderSettings,
  onOpenReaderSettingsModal,
  currentUser,
  onOpenCloudSyncModal,
  isCloudSyncing = false,
  lastSyncedTimestamp,
}) => {
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isDarkTheme = readerSettings.theme === 'obsidian' || readerSettings.theme === 'mystic';

  const toggleQuickTheme = () => {
    const nextTheme = isDarkTheme ? 'parchment' : 'obsidian';
    onUpdateReaderSettings({ ...readerSettings, theme: nextTheme });
  };

  const getTitle = () => {
    switch (activeTab) {
      case 'library':
        return 'Symbolic Texts';
      case 'reader':
        return activeTextTitle || 'Text Reader';
      case 'playground':
        return 'Symbolic Playground';
      case 'blueprints':
        return 'Query Blueprints';
      case 'settings':
        return 'LLM & App Settings';
      default:
        return 'Symbolic Decipher';
    }
  };

  interface NavTabItem {
    id: 'library' | 'reader' | 'playground' | 'blueprints' | 'settings';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    keyBadge: string;
    disabled?: boolean;
  }

  const navTabs: NavTabItem[] = [
    { id: 'library', label: 'Library', icon: Library, keyBadge: '1' },
    { id: 'reader', label: 'Reader', icon: BookOpen, disabled: !hasActiveText, keyBadge: '2' },
    { id: 'playground', label: 'Playground', icon: Zap, keyBadge: '3' },
    { id: 'blueprints', label: 'Blueprints', icon: Sparkles, keyBadge: '4' },
    { id: 'settings', label: 'Settings', icon: Settings, keyBadge: '5' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-amber-950/95 dark:bg-stone-900/95 backdrop-blur-md text-amber-50 border-b border-amber-800/40 dark:border-stone-800 shadow-md transition-colors">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
        {/* Left Section: Back Button or App Brand Icon & Title */}
        <div className="flex items-center space-x-2.5 overflow-hidden shrink-0">
          {activeTab === 'reader' ? (
            <button
              onClick={() => setActiveTab('library')}
              className="p-1.5 -ml-1 rounded-xl hover:bg-amber-900/60 dark:hover:bg-stone-800 text-amber-200 transition"
              title="Back to Library"
              id="btn-back-to-library"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="p-1.5 rounded-xl bg-amber-900/60 dark:bg-amber-700/30 text-amber-300 border border-amber-700/40">
              <Feather className="w-4 h-4" />
            </div>
          )}

          <div className="truncate flex items-center gap-2">
            <div>
              <h1 className="text-sm sm:text-base font-semibold tracking-wide truncate text-amber-100 font-serif">
                {getTitle()}
              </h1>
              {activeTab === 'reader' && (
                <p className="text-[11px] text-amber-300/80 truncate -mt-0.5 font-sans hidden sm:block">
                  Tap word or highlight passage to decipher
                </p>
              )}
            </div>

            {isOffline && (
              <span 
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-medium bg-stone-800 text-stone-300 border border-stone-700 shrink-0"
                title="Airplane Mode / Offline: Access saved translations and texts anytime"
              >
                <WifiOff className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">Offline</span>
              </span>
            )}
          </div>
        </div>

        {/* Center Section: Desktop Navigation Tabs (Visible on tablet & desktop) */}
        <nav className="hidden md:flex items-center space-x-1 bg-amber-900/40 dark:bg-stone-950/70 p-1 rounded-2xl border border-amber-800/40 dark:border-stone-800/80">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isDisabled = tab.disabled;

            return (
              <button
                key={tab.id}
                onClick={() => !isDisabled && setActiveTab(tab.id as any)}
                disabled={isDisabled}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition ${
                  isActive
                    ? 'bg-amber-800 dark:bg-stone-800 text-amber-100 shadow-xs border border-amber-700/50 dark:border-stone-700'
                    : isDisabled
                    ? 'opacity-40 cursor-not-allowed text-stone-500'
                    : 'text-amber-200/80 hover:text-amber-100 hover:bg-amber-900/40 dark:hover:bg-stone-800/60'
                }`}
                id={`btn-desktop-tab-${tab.id}`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                <kbd className="hidden lg:inline-block text-[9px] px-1 rounded bg-amber-950/60 dark:bg-stone-900 text-amber-400 font-mono">
                  {tab.keyBadge}
                </kbd>
              </button>
            );
          })}
        </nav>

        {/* Right Section: Cloud Sync & Action Controls */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          {/* Google Cloud Sync Button */}
          <button
            onClick={onOpenCloudSyncModal}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition border ${
              currentUser
                ? 'bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-200 border-emerald-800/80'
                : 'bg-amber-900/60 hover:bg-amber-800/80 text-amber-200 border-amber-700/60'
            }`}
            title={
              currentUser
                ? `Google Cloud: Automatic incremental sync active${
                    lastSyncedTimestamp
                      ? ` (Last synced: ${new Date(lastSyncedTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})`
                      : ''
                  }`
                : 'Google Cloud Sync: Sign in with Google to enable automatic incremental cloud saves'
            }
            id="btn-topbar-cloud-sync"
          >
            {currentUser ? (
              <>
                {currentUser.photoURL ? (
                  <img 
                    src={currentUser.photoURL} 
                    alt={currentUser.displayName || 'Google'} 
                    referrerPolicy="no-referrer"
                    className="w-4 h-4 rounded-full object-cover border border-emerald-400"
                  />
                ) : (
                  <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span className="hidden sm:inline truncate max-w-[100px]">
                  {currentUser.displayName ? currentUser.displayName.split(' ')[0] : 'Cloud'}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </>
            ) : (
              <>
                <Cloud className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden sm:inline">Google Cloud</span>
              </>
            )}
          </button>

          {/* Theme Quick Toggle */}
          <button
            onClick={toggleQuickTheme}
            className="p-2 rounded-xl hover:bg-amber-900/50 dark:hover:bg-stone-800 text-amber-200 transition border border-transparent hover:border-amber-700/40"
            title={isDarkTheme ? 'Switch to Parchment' : 'Switch to Dark Obsidian'}
            id="btn-toggle-quick-theme"
          >
            {isDarkTheme ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-amber-200" />}
          </button>

          {/* Reader Settings Modal Trigger (In Reader mode) */}
          {activeTab === 'reader' && onOpenReaderSettingsModal && (
            <button
              onClick={onOpenReaderSettingsModal}
              className="p-2 rounded-xl hover:bg-amber-900/50 dark:hover:bg-stone-800 text-amber-200 transition border border-transparent hover:border-amber-700/40"
              title="Reader Options"
              id="btn-reader-options"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
