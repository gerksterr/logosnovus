import React from 'react';
import { Zap, Unlink } from 'lucide-react';
import { MirrorTranslationData } from '../../types';

interface CompositeGroupItem {
  groupId: string;
  groupIndex: number;
  sentenceIndex?: number;
  rawTagId?: string;
  pIdx: number;
  compoundMeaning: string;
  parts: Array<{ orig: string; trans: string; wIdx: number }>;
}

interface CalqueCompositesTabProps {
  editableMirrorData: MirrorTranslationData;
  compositeGroups: CompositeGroupItem[];
  onToggleGlobalCompositeMode: () => void;
  onUnlinkGroup: (pIdx: number, groupId: string) => void;
}

export const CalqueCompositesTab: React.FC<CalqueCompositesTabProps> = ({
  editableMirrorData,
  compositeGroups,
  onToggleGlobalCompositeMode,
  onUnlinkGroup,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-stone-200">Separable Verb & Composite Groups</span>
          <p className="text-xs text-stone-400">
            Discontinuous words that belong together semantically (e.g. <em>zeichnet ... aus</em>).
          </p>
        </div>
        <button
          onClick={onToggleGlobalCompositeMode}
          className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer ${
            editableMirrorData.compositeDisplayMode === 'compound'
              ? 'bg-cyan-900/60 text-cyan-200 border-cyan-500/60'
              : 'bg-stone-800 text-stone-300 border-stone-700'
          }`}
          title="Toggle global display preference between literal separated glosses and unified compound meanings in Mirror mode"
        >
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>
            Display: {editableMirrorData.compositeDisplayMode === 'compound' ? 'Compound Meanings' : 'Separated Literal Glosses'}
          </span>
        </button>
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {compositeGroups.map((group) => (
          <div 
            key={`comp-grp-${group.pIdx}-${group.groupId}`}
            className="p-4 rounded-2xl bg-stone-950 border border-cyan-900/60 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-mono text-xs font-bold">
                  Group ⚡{group.groupIndex} (Para {group.pIdx + 1}{group.sentenceIndex !== undefined ? `, Sent ${group.sentenceIndex + 1}` : ''})
                </span>
                <span className="text-xs text-stone-400">
                  {group.parts.length} linked words
                </span>
              </div>
              <button
                onClick={() => onUnlinkGroup(group.pIdx, group.groupId)}
                className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-red-950/60 text-stone-400 hover:text-red-300 text-xs border border-stone-800 hover:border-red-800/60 flex items-center space-x-1 transition cursor-pointer"
                title="Unlink this composite word group into separate independent words"
              >
                <Unlink className="w-3 h-3 text-red-400" />
                <span>Unlink Group</span>
              </button>
            </div>

            {/* Discontinuous Parts Formula */}
            <div className="bg-stone-900/90 p-3 rounded-xl border border-stone-800 text-xs space-y-2">
              <div className="flex items-center space-x-2 text-stone-300">
                <span className="font-serif font-bold text-amber-200">
                  {group.parts.map((p) => p.orig).join(' ... ')}
                </span>
                <span className="text-stone-500">→</span>
                <span className="font-semibold text-cyan-300">
                  "{group.compoundMeaning}"
                </span>
              </div>
              <div className="text-[11px] text-stone-400 flex items-center space-x-3">
                <span>Literal parts:</span>
                {group.parts.map((p, pI) => (
                  <span key={pI} className="font-mono text-stone-300 bg-stone-950 px-1.5 py-0.5 rounded border border-stone-800">
                    {p.orig} = "{p.trans}"
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
