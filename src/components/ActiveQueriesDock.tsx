import React from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Square, 
  Maximize2, 
  X, 
  Layers 
} from 'lucide-react';
import { ActiveDecipherQuery } from '../types';

interface ActiveQueriesDockProps {
  queries: ActiveDecipherQuery[];
  activeQueryId?: string | null;
  onSelectQuery: (query: ActiveDecipherQuery) => void;
  onHaltQuery: (queryId: string) => void;
  onDismissQuery: (queryId: string) => void;
}

export const ActiveQueriesDock: React.FC<ActiveQueriesDockProps> = ({
  queries,
  activeQueryId,
  onSelectQuery,
  onHaltQuery,
  onDismissQuery,
}) => {
  if (queries.length === 0) return null;

  // Filter queries to show:
  // If a sheet is currently open viewing one query, hide that one and show the others
  const visibleQueries = activeQueryId 
    ? queries.filter((q) => q.id !== activeQueryId)
    : queries;

  if (visibleQueries.length === 0) return null;

  return (
    <div 
      className="fixed bottom-18 sm:bottom-4 right-3 left-3 sm:left-auto sm:right-6 sm:w-[440px] z-40 space-y-2 pointer-events-auto"
      id="active-queries-floating-dock"
    >
      {visibleQueries.slice(0, 3).map((query) => {
        const isLoading = query.status === 'loading';
        const isCompleted = query.status === 'completed';
        const isError = query.status === 'error';

        return (
          <div
            key={query.id}
            className={`p-3 rounded-2xl shadow-2xl backdrop-blur-md border flex items-center justify-between space-x-3 transition-all duration-200 animate-in slide-in-from-bottom-2 ${
              isLoading
                ? 'bg-stone-900/95 border-amber-500/70 text-stone-100'
                : isError
                ? 'bg-stone-900/95 border-red-500/70 text-stone-100'
                : 'bg-stone-900/95 border-emerald-500/70 text-stone-100'
            }`}
          >
            {/* Clickable Info Area to Open Query */}
            <div 
              className="flex items-center space-x-2.5 overflow-hidden flex-1 cursor-pointer"
              onClick={() => onSelectQuery(query)}
              title="Click to view full deciphered result"
            >
              <div className={`p-2 rounded-xl shrink-0 ${
                isLoading 
                  ? 'bg-amber-950 text-amber-400 animate-spin border border-amber-800' 
                  : isError
                  ? 'bg-red-950 text-red-400 border border-red-800'
                  : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
              }`}>
                {isLoading && <Sparkles className="w-4 h-4" />}
                {isCompleted && <CheckCircle2 className="w-4 h-4" />}
                {isError && <AlertCircle className="w-4 h-4" />}
              </div>

              <div className="truncate text-xs">
                <div className="flex items-center space-x-1.5">
                  <span className="font-serif font-bold text-amber-200 truncate max-w-[150px]">
                    "{query.targetText}"
                  </span>
                  <span className="text-[10px] text-stone-400">({query.type})</span>
                  {isLoading && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-950 text-amber-300 border border-amber-800 animate-pulse font-sans">
                      Translating...
                    </span>
                  )}
                  {isCompleted && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-sans">
                      Ready
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-stone-300 truncate mt-0.5">
                  {isLoading 
                    ? (query.streamText ? `Streaming: ${query.streamText.slice(-35)}` : `Deciphering with AI...`)
                    : isError 
                    ? (query.error || 'Error during translation')
                    : `Completed — tap to view full answer`}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-1.5 shrink-0">
              {isLoading && (
                <button
                  onClick={() => onHaltQuery(query.id)}
                  className="p-1.5 rounded-xl bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 transition cursor-pointer"
                  title="Halt this query"
                  id={`btn-dock-halt-${query.id}`}
                >
                  <Square className="w-3.5 h-3.5 fill-red-400" />
                </button>
              )}

              <button
                onClick={() => onSelectQuery(query)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1 shadow-xs transition cursor-pointer ${
                  isCompleted 
                    ? 'bg-emerald-700 hover:bg-emerald-600 text-emerald-50' 
                    : 'bg-amber-700 hover:bg-amber-600 text-amber-50'
                }`}
                id={`btn-dock-open-${query.id}`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>View</span>
              </button>

              {!isLoading && (
                <button
                  onClick={() => onDismissQuery(query.id)}
                  className="p-1.5 rounded-xl hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition cursor-pointer"
                  title="Dismiss notification"
                  id={`btn-dock-dismiss-${query.id}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {visibleQueries.length > 3 && (
        <div className="text-center">
          <span className="text-[11px] px-3 py-1 rounded-full bg-stone-900/90 text-stone-300 border border-stone-800 shadow-md backdrop-blur-xs">
            +{visibleQueries.length - 3} more queries running in background
          </span>
        </div>
      )}
    </div>
  );
};
