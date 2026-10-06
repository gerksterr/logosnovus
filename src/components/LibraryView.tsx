import React, { useState } from 'react';
import { 
  BookOpen, 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  Sparkles, 
  Download, 
  Upload, 
  RefreshCw, 
  FileText,
  Tag,
  Feather,
  Cloud,
  LayoutGrid,
  List,
  Check,
  ArrowUpDown,
  MessageSquare
} from 'lucide-react';
import { TextItem, QueryBlueprint } from '../types';
import { exportAppData, importAppData, getStoredAnnotations, getAllStoredDecipherChats } from '../services/storageService';
// [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS]
import { runAutoLegacyChatMigration } from '../services/legacyChatMigrationService';
import { SAMPLE_TEXTS } from '../data/seedData';
import { FormattedTextPreview } from './FormattedTextPreview';

export type TextSortOption = 
  | 'time-added-desc'
  | 'time-added-asc'
  | 'title-asc'
  | 'title-desc'
  | 'author-asc'
  | 'updated-desc';

interface LibraryViewProps {
  texts: TextItem[];
  blueprints: QueryBlueprint[];
  onSelectText: (text: TextItem) => void;
  onOpenCreateTextModal: () => void;
  onOpenEditTextModal: (text: TextItem) => void;
  onDeleteText: (id: string) => void;
  onRefreshData: () => void;
  onOpenCloudSyncModal?: () => void;
  isCloudSynced?: boolean;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  texts,
  blueprints,
  onSelectText,
  onOpenCreateTextModal,
  onOpenEditTextModal,
  onDeleteText,
  onRefreshData,
  onOpenCloudSyncModal,
  isCloudSynced = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<TextSortOption>(() => {
    try {
      const saved = localStorage.getItem('symbolic_texts_sort_v1');
      return (saved as TextSortOption) || 'time-added-desc';
    } catch {
      return 'time-added-desc';
    }
  });

  const handleSortChange = (newSort: TextSortOption) => {
    setSortBy(newSort);
    try {
      localStorage.setItem('symbolic_texts_sort_v1', newSort);
    } catch {}
  };

  const languages = ['all', ...Array.from(new Set(texts.map((t) => t.language || 'German')))];

  // Build lookup of latest activity / translation timestamps and annotation counts for all texts
  const { latestActivityMap, annotationCountMap } = React.useMemo(() => {
    const activityMap = new Map<string, number>();
    const countMap = new Map<string, number>();
    const allAnnotations = getStoredAnnotations();

    for (const ann of allAnnotations) {
      if (!ann.textId || ann.textId === 'playground-text') continue;
      countMap.set(ann.textId, (countMap.get(ann.textId) || 0) + 1);

      const annTime = ann.createdAt ? new Date(ann.createdAt).getTime() : 0;
      const currentLatest = activityMap.get(ann.textId) || 0;
      if (annTime > currentLatest) {
        activityMap.set(ann.textId, annTime);
      }
    }

    return { latestActivityMap: activityMap, annotationCountMap: countMap };
  }, [texts]);

  const filteredTexts = texts.filter((text) => {
    const matchesSearch =
      text.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (text.author && text.author.toLowerCase().includes(searchQuery.toLowerCase())) ||
      text.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (text.tags && text.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())));

    const matchesLanguage = selectedLanguage === 'all' || text.language === selectedLanguage;

    return matchesSearch && matchesLanguage;
  });

  // Sort filtered texts deterministically
  const sortedTexts = [...filteredTexts].sort((a, b) => {
    switch (sortBy) {
      case 'time-added-desc': {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return a.title.localeCompare(b.title);
      }
      case 'time-added-asc': {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.title.localeCompare(b.title);
      }
      case 'title-asc':
        return a.title.localeCompare(b.title);
      case 'title-desc':
        return b.title.localeCompare(a.title);
      case 'author-asc': {
        const authA = a.author || '';
        const authB = b.author || '';
        return authA.localeCompare(authB);
      }
      case 'updated-desc': {
        const annTimeA = latestActivityMap.get(a.id) || 0;
        const textUpdatedA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const textCreatedA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const effectiveTimeA = Math.max(annTimeA, textUpdatedA, textCreatedA);

        const annTimeB = latestActivityMap.get(b.id) || 0;
        const textUpdatedB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        const textCreatedB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        const effectiveTimeB = Math.max(annTimeB, textUpdatedB, textCreatedB);

        if (effectiveTimeA !== effectiveTimeB) {
          return effectiveTimeB - effectiveTimeA;
        }
        return a.title.localeCompare(b.title);
      }
      default:
        return 0;
    }
  });

  const getBlueprintName = (id: string) => {
    const bp = blueprints.find((b) => b.id === id);
    return bp ? bp.name : 'Default Blueprint';
  };

  const handleExportData = () => {
    const jsonStr = exportAppData();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `symbolic-texts-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportChatsOnly = () => {
    const chats = getAllStoredDecipherChats();
    const count = Object.keys(chats).length;
    if (count === 0) {
      alert('No translation chats found in browser storage.');
      return;
    }
    const jsonStr = JSON.stringify(chats, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `symbolic-translation-chats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const res = importAppData(content);
        if (res.success) {
          // [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS]
          // If imported data contains single-translation chats, automatically migrate them!
          runAutoLegacyChatMigration();
          alert(res.message);
          onRefreshData();
        } else {
          alert(res.message);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreSamples = () => {
    if (confirm('Restore default sample symbolic texts (Carl Jung, Nietzsche, Paracelsus)?')) {
      SAMPLE_TEXTS.forEach((sample) => {
        if (!texts.some((t) => t.id === sample.id)) {
          texts.push(sample);
        }
      });
      localStorage.setItem('symbolic_texts_v1', JSON.stringify(texts));
      onRefreshData();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24 space-y-6">
      {/* Header Banner */}
      <div className="p-5 sm:p-6 rounded-3xl bg-linear-to-r from-amber-950/80 via-stone-900 to-amber-950/60 border border-amber-800/40 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-900/60 text-amber-300 text-xs font-serif border border-amber-700/50">
            <Feather className="w-3.5 h-3.5" />
            <span>Symbolic Text Repository</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-amber-100 tracking-tight">
            Foreign Text Library
          </h2>
          <p className="text-xs text-stone-300 max-w-2xl leading-relaxed">
            Store and recall foreign symbolic works. Click any text to open the interactive decipher reader with word etymologies, passage symbolism, and LaTeX equations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onOpenCloudSyncModal && (
            <button
              onClick={onOpenCloudSyncModal}
              className={`px-4 py-2.5 rounded-2xl text-xs font-medium flex items-center space-x-2 transition border shadow-md cursor-pointer ${
                isCloudSynced
                  ? 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border-emerald-700/80'
                  : 'bg-stone-900 hover:bg-stone-800 text-amber-200 border-amber-800/60'
              }`}
              id="btn-library-cloud-sync"
            >
              <Cloud className="w-4 h-4 text-amber-400" />
              <span>{isCloudSynced ? 'Google Cloud Synced' : 'Google Cloud Sync'}</span>
            </button>
          )}

          <button
            onClick={onOpenCreateTextModal}
            className="px-4 py-2.5 rounded-2xl bg-amber-700 hover:bg-amber-600 text-amber-50 text-xs font-medium flex items-center space-x-2 shadow-md transition cursor-pointer"
            id="btn-add-text-primary"
          >
            <Plus className="w-4 h-4" />
            <span>Paste Foreign Text</span>
          </button>
        </div>
      </div>

      {/* Toolbar: Search, Language Filter & Grid/List View Toggles */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-stone-900/80 p-3.5 rounded-2xl border border-stone-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search titles, authors, words or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-xs text-stone-200 placeholder-stone-500 focus:outline-hidden focus:border-amber-600"
            id="input-library-search"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 overflow-x-auto pb-1 md:pb-0">
          {/* Sort Selector */}
          <div className="flex items-center space-x-1.5 bg-stone-950 px-2.5 py-1 rounded-xl border border-stone-800 shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] text-stone-400">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as TextSortOption)}
              className="bg-transparent text-xs text-stone-200 focus:outline-hidden cursor-pointer font-medium"
              id="select-library-sort"
            >
              <option value="time-added-desc" className="bg-stone-900 text-stone-100">
                Time Added (Newest first)
              </option>
              <option value="time-added-asc" className="bg-stone-900 text-stone-100">
                Time Added (Oldest first)
              </option>
              <option value="title-asc" className="bg-stone-900 text-stone-100">
                Title (A–Z)
              </option>
              <option value="title-desc" className="bg-stone-900 text-stone-100">
                Title (Z–A)
              </option>
              <option value="author-asc" className="bg-stone-900 text-stone-100">
                Author (A–Z)
              </option>
              <option value="updated-desc" className="bg-stone-900 text-stone-100">
                Recently Updated
              </option>
            </select>
          </div>

          {/* Language filters */}
          <div className="flex items-center space-x-1.5 overflow-x-auto">
            <span className="text-[11px] text-stone-400 shrink-0">Language:</span>
            {languages.map((lang) => (
              <button
                key={lang}
                onClick={() => setSelectedLanguage(lang)}
                className={`px-2.5 py-1 rounded-xl text-xs font-medium capitalize shrink-0 transition cursor-pointer ${
                  selectedLanguage === lang
                    ? 'bg-amber-800 text-amber-100 border border-amber-600'
                    : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>

          {/* Desktop Grid / List Layout Switcher */}
          <div className="hidden sm:flex items-center space-x-1 bg-stone-950 p-1 rounded-xl border border-stone-800">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'grid' ? 'bg-amber-800 text-amber-100' : 'text-stone-400 hover:text-stone-200'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'list' ? 'bg-amber-800 text-amber-100' : 'text-stone-400 hover:text-stone-200'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Backup / Restore Controls */}
      <div className="flex items-center justify-between text-xs text-stone-400 px-1">
        <span>Stored Texts: <strong className="text-amber-200 font-normal">{sortedTexts.length}</strong></span>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRestoreSamples}
            className="hover:text-amber-300 flex items-center space-x-1 cursor-pointer"
            title="Restore sample texts"
            id="btn-restore-samples"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Samples</span>
          </button>
          <button
            onClick={handleExportData}
            className="hover:text-amber-300 flex items-center space-x-1 cursor-pointer"
            title="Export full JSON backup"
            id="btn-export-data"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
          <button
            onClick={handleExportChatsOnly}
            className="hover:text-amber-300 flex items-center space-x-1 cursor-pointer"
            title="Export all translation chats as standalone JSON"
            id="btn-export-chats"
          >
            <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Chats</span>
          </button>
          <label 
            className="hover:text-amber-300 flex items-center space-x-1 cursor-pointer"
            id="btn-import-data-label"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import JSON</span>
            <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
          </label>
        </div>
      </div>

      {/* Text Cards Grid or List */}
      <div>
        {sortedTexts.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-stone-900/50 border border-stone-800 space-y-3">
            <BookOpen className="w-10 h-10 text-stone-600 mx-auto" />
            <h3 className="text-base font-serif font-medium text-stone-300">
              No symbolic texts found
            </h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Paste or import foreign texts (Carl Jung's Red Book, Nietzsche, Alchemical scripts, etc.) to store and decipher them.
            </p>
            <button
              onClick={onOpenCreateTextModal}
              className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-amber-50 text-xs font-medium inline-flex items-center space-x-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Paste First Text</span>
            </button>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-4'}>
            {sortedTexts.map((text) => {
              const wordBpName = getBlueprintName(text.wordBlueprintId);
              const passageBpName = getBlueprintName(text.passageBlueprintId);
              const wordCount = text.content.trim().split(/\s+/).length;
              const transCount = annotationCountMap.get(text.id) || 0;

              return (
                <div
                  key={text.id}
                  className="p-5 rounded-3xl bg-stone-900 border border-stone-800/90 shadow-md hover:border-amber-800/60 transition flex flex-col justify-between space-y-3 group"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] uppercase font-semibold tracking-wider px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800/60">
                            {text.language}
                          </span>
                          {transCount > 0 && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700/60">
                              {transCount} {transCount === 1 ? 'translation' : 'translations'}
                            </span>
                          )}
                          {text.author && (
                            <span className="text-xs text-stone-400">
                              by {text.author}
                            </span>
                          )}
                        </div>

                        <h3 
                          onClick={() => onSelectText(text)}
                          className="text-base sm:text-lg font-serif font-semibold text-amber-100 hover:text-amber-300 cursor-pointer transition leading-snug"
                        >
                          {text.title}
                        </h3>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          onClick={() => onOpenEditTextModal(text)}
                          className="p-2 rounded-xl hover:bg-stone-800 text-stone-400 hover:text-amber-300 transition"
                          title="Edit Text & Blueprints"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteText(text.id)}
                          className="p-2 rounded-xl hover:bg-red-950 text-stone-500 hover:text-red-400 transition"
                          title="Delete Text"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Content Excerpt Preview */}
                    <div 
                      onClick={() => onSelectText(text)}
                      dir="auto"
                      className="text-xs font-serif text-stone-300 leading-relaxed line-clamp-3 cursor-pointer p-3 rounded-2xl bg-stone-950/80 border border-stone-800/60 hover:bg-stone-950 transition overflow-hidden"
                    >
                      <FormattedTextPreview content={text.content} language={text.language} isDark={true} />
                    </div>
                  </div>

                  {/* Associated Blueprints & Tags Bar */}
                  <div className="pt-2 border-t border-stone-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5 text-stone-400">
                      <span className="flex items-center space-x-1 bg-stone-950 px-2 py-0.5 rounded-lg border border-stone-800">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span className="truncate max-w-[110px]">{wordBpName}</span>
                      </span>

                      <span className="flex items-center space-x-1 bg-stone-950 px-2 py-0.5 rounded-lg border border-stone-800">
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        <span className="truncate max-w-[110px]">{passageBpName}</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end space-x-2 text-stone-400 shrink-0">
                      <span>{wordCount} words</span>
                      <button
                        onClick={() => onSelectText(text)}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-800 hover:bg-amber-700 text-amber-100 font-medium flex items-center space-x-1 transition shadow-xs cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Read</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
