import React, { useState, useEffect } from 'react';
import { 
  X, 
  Cloud, 
  UploadCloud, 
  DownloadCloud, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  Laptop, 
  Smartphone, 
  Sparkles, 
  LogOut, 
  ShieldCheck, 
  BookOpen, 
  Bookmark, 
  Cpu, 
  Sliders,
  ChevronRight,
  Database
} from 'lucide-react';
import { User } from 'firebase/auth';
import { signInWithGoogle, logOut } from '../services/firebase';
import { 
  saveAllToCloud, 
  loadAllFromCloud, 
  getCloudSyncMeta, 
  getDeviceType, 
  SyncMeta, 
  CloudUserData 
} from '../services/cloudSyncService';
import { 
  TextItem, 
  QueryBlueprint, 
  Annotation, 
  LLMConfig, 
  ReaderSettings,
  MirrorTranslationData 
} from '../types';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onUserChange: (user: User | null) => void;
  localData: {
    texts: TextItem[];
    blueprints: QueryBlueprint[];
    annotations: Annotation[];
    mirrorTranslations?: Record<string, MirrorTranslationData>;
    llmConfig: LLMConfig;
    readerSettings: ReaderSettings;
    scrollPositions: Record<string, number>;
  };
  onApplyCloudData: (cloudData: CloudUserData) => void;
  lastSyncedTimestamp: string | null;
  onUpdateLastSynced: (timestamp: string) => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserChange,
  localData,
  onApplyCloudData,
  lastSyncedTimestamp,
  onUpdateLastSynced,
}) => {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [cloudMeta, setCloudMeta] = useState<SyncMeta | null>(null);
  const [deviceType, setDeviceType] = useState<'desktop' | 'mobile' | 'tablet'>('desktop');

  useEffect(() => {
    setDeviceType(getDeviceType());
  }, []);

  // Fetch Cloud Sync metadata when user is signed in and modal opens
  useEffect(() => {
    if (isOpen && currentUser) {
      getCloudSyncMeta(currentUser.uid).then((meta) => {
        if (meta) {
          setCloudMeta(meta);
          if (meta.lastSyncedAt) {
            onUpdateLastSynced(meta.lastSyncedAt);
          }
        }
      });
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setStatusMessage(null);
    try {
      const user = await signInWithGoogle();
      onUserChange(user);
      setStatusMessage({ 
        text: `Signed in as ${user.displayName || user.email}. Cloud sync active!`, 
        type: 'success' 
      });
      
      // Auto check if cloud has existing data
      const cloudData = await loadAllFromCloud(user.uid);
      if (cloudData && (cloudData.texts.length > 0 || cloudData.blueprints.length > 0)) {
        setStatusMessage({
          text: `Found ${cloudData.texts.length} texts and ${cloudData.annotations.length} deciphered notes in your Google Cloud account.`,
          type: 'info'
        });
      } else {
        // First time cloud user: auto backup current local texts
        await handleUploadAll(user.uid);
      }
    } catch (err: any) {
      console.error('Sign-in failed:', err);
      setStatusMessage({ 
        text: err.message || 'Google sign-in was cancelled or failed.', 
        type: 'error' 
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logOut();
      onUserChange(null);
      setCloudMeta(null);
      setStatusMessage({ text: 'Signed out from Google account.', type: 'info' });
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  // 1-Click Save/Upload All to Cloud with Smart Merge
  const handleUploadAll = async (uidToUse?: string) => {
    const uid = uidToUse || currentUser?.uid;
    if (!uid) {
      setStatusMessage({ text: 'Please sign in with Google first.', type: 'error' });
      return;
    }

    setIsUploading(true);
    setStatusMessage(null);
    try {
      const result = await saveAllToCloud(uid, localData);
      onUpdateLastSynced(result.syncedAt);
      
      // Update local storage and app state with the merged data
      onApplyCloudData(result.mergedData);

      setCloudMeta({
        lastSyncedAt: result.syncedAt,
        totalTexts: result.mergedData.texts.length,
        totalAnnotations: result.mergedData.annotations.length,
        totalBlueprints: result.mergedData.blueprints.length,
        lastClientDevice: deviceType,
      });

      const addedParts: string[] = [];
      if (result.addedFromCloudCount.texts > 0) {
        addedParts.push(`${result.addedFromCloudCount.texts} existing cloud text(s)`);
      }
      if (result.addedFromCloudCount.annotations > 0) {
        addedParts.push(`${result.addedFromCloudCount.annotations} note(s)`);
      }
      if (result.addedFromCloudCount.blueprints > 0) {
        addedParts.push(`${result.addedFromCloudCount.blueprints} blueprint(s)`);
      }

      const mergeInfo = addedParts.length > 0
        ? ` Merged and preserved ${addedParts.join(', ')} from prior cloud saves.`
        : '';

      setStatusMessage({
        text: `Saved to Google Cloud! ${result.mergedData.texts.length} texts, ${result.mergedData.annotations.length} notes, custom blueprints & settings backed up.${mergeInfo}`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('Cloud save failed:', err);
      setStatusMessage({ text: `Failed to save to Google Cloud: ${err.message}`, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  // 1-Click Load/Restore All from Cloud
  const handleDownloadAll = async () => {
    if (!currentUser) {
      setStatusMessage({ text: 'Please sign in with Google first.', type: 'error' });
      return;
    }

    setIsDownloading(true);
    setStatusMessage(null);
    try {
      const cloudData = await loadAllFromCloud(currentUser.uid);
      if (!cloudData) {
        setStatusMessage({
          text: 'No cloud backup found yet for this account. Tap "Save to Google Cloud" to create your first cloud backup!',
          type: 'info',
        });
        return;
      }

      onApplyCloudData(cloudData);
      if (cloudData.lastSyncedAt) {
        onUpdateLastSynced(cloudData.lastSyncedAt);
      }
      setStatusMessage({
        text: `Loaded from Google Cloud! Restored ${cloudData.texts.length} texts, ${cloudData.annotations.length} notes, and settings.`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('Cloud load failed:', err);
      setStatusMessage({ text: `Failed to load from Google Cloud: ${err.message}`, type: 'error' });
    } finally {
      setIsDownloading(false);
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Not synced yet';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs cursor-pointer"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl text-stone-100 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 cursor-default"
        id="modal-cloud-sync"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-stone-800 bg-stone-950 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-amber-950/80 text-amber-400 border border-amber-800/60">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-amber-100 flex items-center space-x-2">
                <span>Google Cloud Sync</span>
                <span className="text-[10px] uppercase font-sans font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Multi-Client
                </span>
              </h2>
              <p className="text-xs text-stone-400">
                Sync texts, custom blueprints, and deciphered notes across Phone & Desktop
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition"
            id="btn-close-cloud-sync-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-sm">
          {/* Google Account Authentication Card */}
          <div className="p-4 rounded-2xl bg-stone-950 border border-stone-800 space-y-3">
            {currentUser ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 overflow-hidden">
                  {currentUser.photoURL ? (
                    <img 
                      src={currentUser.photoURL} 
                      alt={currentUser.displayName || 'Google User'} 
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-full border-2 border-amber-500/60 object-cover"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-amber-900 text-amber-100 flex items-center justify-center font-bold text-base border border-amber-700">
                      {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'G'}
                    </div>
                  )}
                  <div className="truncate">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-semibold text-stone-100 truncate text-sm">
                        {currentUser.displayName || 'Google Account'}
                      </span>
                      <span className="p-0.5 rounded-full bg-emerald-500/20 text-emerald-400" title="Connected">
                        <Check className="w-3 h-3" />
                      </span>
                    </div>
                    <p className="text-xs text-stone-400 truncate">{currentUser.email}</p>
                    <p className="text-[11px] text-amber-400/90 font-mono mt-0.5">
                      Connected to Google Cloud Firestore
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleSignOut}
                  className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-red-950 hover:text-red-300 text-stone-300 text-xs font-medium flex items-center space-x-1.5 border border-stone-700 hover:border-red-800 transition shrink-0"
                  id="btn-google-signout"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-center sm:text-left">
                <div>
                  <h3 className="text-sm font-semibold text-stone-100">Connect Google Account</h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Sign in with your Google account to automatically store and load your library across your phone, tablet, and desktop browser.
                  </p>
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  disabled={isSigningIn}
                  className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-stone-100 text-stone-900 font-medium text-xs sm:text-sm flex items-center justify-center space-x-3 shadow-lg transition active:scale-[0.99] disabled:opacity-50"
                  id="btn-google-signin-modal"
                >
                  {isSigningIn ? (
                    <RefreshCw className="w-4 h-4 text-stone-800 animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  )}
                  <span className="font-semibold text-stone-800">
                    {isSigningIn ? 'Signing in...' : 'Sign in with Google Account'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Status Alert Banner if any */}
          {statusMessage && (
            <div className={`p-3 rounded-2xl text-xs flex items-start space-x-2.5 ${
              statusMessage.type === 'success' 
                ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-200' 
                : statusMessage.type === 'error'
                ? 'bg-red-950/80 border border-red-800 text-red-200'
                : 'bg-stone-950 border border-stone-800 text-stone-300'
            }`}>
              {statusMessage.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : statusMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              ) : (
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 leading-relaxed font-sans">{statusMessage.text}</div>
            </div>
          )}

          {/* 1-Click Action Buttons */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-amber-200 uppercase tracking-wider">
              1-Click Cloud Sync Actions
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 1-Click Save to Cloud */}
              <button
                onClick={() => handleUploadAll()}
                disabled={!currentUser || isUploading}
                className="p-4 rounded-2xl bg-amber-950/60 hover:bg-amber-900/80 border border-amber-700/60 text-left space-y-1.5 transition group active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md"
                id="btn-cloud-save-all"
              >
                <div className="flex items-center justify-between text-amber-300">
                  <div className="flex items-center space-x-2 font-semibold text-xs sm:text-sm">
                    {isUploading ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                    ) : (
                      <UploadCloud className="w-4 h-4 text-amber-400" />
                    )}
                    <span>Save to Google Cloud</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-500 group-hover:translate-x-0.5 transition" />
                </div>
                <p className="text-[11px] text-stone-300 leading-normal">
                  Upload all current local texts ({localData.texts.length}), notes ({localData.annotations.length}), blueprints & settings to your account.
                </p>
              </button>

              {/* 1-Click Load from Cloud */}
              <button
                onClick={handleDownloadAll}
                disabled={!currentUser || isDownloading}
                className="p-4 rounded-2xl bg-stone-950 hover:bg-stone-800 border border-stone-800 text-left space-y-1.5 transition group active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md"
                id="btn-cloud-load-all"
              >
                <div className="flex items-center justify-between text-stone-200">
                  <div className="flex items-center space-x-2 font-semibold text-xs sm:text-sm">
                    {isDownloading ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                    ) : (
                      <DownloadCloud className="w-4 h-4 text-emerald-400" />
                    )}
                    <span>Load from Google Cloud</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500 group-hover:translate-x-0.5 transition" />
                </div>
                <p className="text-[11px] text-stone-400 leading-normal">
                  Download and restore your cloud library, reading scroll positions, and custom LLM configs into this browser.
                </p>
              </button>
            </div>
          </div>

          {/* Sync Stats & Devices Card */}
          <div className="p-4 rounded-2xl bg-stone-950 border border-stone-800/80 space-y-3">
            <div className="flex items-center justify-between border-b border-stone-800/60 pb-2">
              <span className="text-xs font-semibold text-stone-300 flex items-center space-x-1.5">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                <span>Cloud Synchronization Status</span>
              </span>
              <span className="text-[11px] text-stone-400">
                Last synced: <strong className="text-amber-200 font-normal">{formatDate(lastSyncedTimestamp)}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 rounded-xl bg-stone-900 border border-stone-800">
                <span className="text-base font-bold text-amber-100 font-serif">
                  {cloudMeta ? cloudMeta.totalTexts : localData.texts.length}
                </span>
                <p className="text-[10px] text-stone-400">Library Texts</p>
              </div>
              <div className="p-2 rounded-xl bg-stone-900 border border-stone-800">
                <span className="text-base font-bold text-amber-100 font-serif">
                  {cloudMeta ? cloudMeta.totalAnnotations : localData.annotations.length}
                </span>
                <p className="text-[10px] text-stone-400">Deciphered Notes</p>
              </div>
              <div className="p-2 rounded-xl bg-stone-900 border border-stone-800">
                <span className="text-base font-bold text-amber-100 font-serif">
                  {localData.mirrorTranslations ? Object.keys(localData.mirrorTranslations).length : 0}
                </span>
                <p className="text-[10px] text-stone-400">Calque Mirrors</p>
              </div>
              <div className="p-2 rounded-xl bg-stone-900 border border-stone-800">
                <span className="text-base font-bold text-amber-100 font-serif">
                  {cloudMeta ? cloudMeta.totalBlueprints : localData.blueprints.length}
                </span>
                <p className="text-[10px] text-stone-400">Blueprints</p>
              </div>
            </div>

            {/* Multi-device Compatibility Notice */}
            <div className="pt-2 border-t border-stone-800/60 flex items-center justify-between text-[11px] text-stone-400">
              <div className="flex items-center space-x-2">
                {deviceType === 'desktop' ? (
                  <Laptop className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span>Current Client: <strong className="text-stone-200 uppercase font-medium">{deviceType}</strong></span>
              </div>
              <span className="text-[10px] text-emerald-400 font-medium flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>End-to-End Private</span>
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-950 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl bg-amber-700 hover:bg-amber-600 text-amber-50 text-xs font-semibold shadow-md transition"
            id="btn-done-cloud-sync"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
