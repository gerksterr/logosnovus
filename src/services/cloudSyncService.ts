import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  writeBatch,
  serverTimestamp,
  handleFirestoreError,
  OperationType 
} from './firebase';
import { 
  TextItem, 
  QueryBlueprint, 
  Annotation, 
  LLMConfig, 
  ReaderSettings,
  MirrorTranslationData 
} from '../types';

export interface CloudUserData {
  texts: TextItem[];
  blueprints: QueryBlueprint[];
  annotations: Annotation[];
  mirrorTranslations?: Record<string, MirrorTranslationData>;
  llmConfig?: LLMConfig;
  readerSettings?: ReaderSettings;
  scrollPositions?: Record<string, any>;
  lastSyncedAt?: string;
}

export interface SyncMeta {
  lastSyncedAt: string;
  totalTexts: number;
  totalAnnotations: number;
  totalBlueprints: number;
  lastClientDevice: string;
}

/**
 * Recursively sanitizes any object or array for Cloud Firestore writes.
 * Removes any keys with `undefined` values and ensures nested structures are completely safe.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as any;
  }
  if (typeof data === 'object') {
    if (data instanceof Date) {
      return data.toISOString() as any;
    }
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return data;
}

// Check if user is running on desktop or mobile
export function getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width >= 1024) return 'desktop';
  if (width >= 640) return 'tablet';
  return 'mobile';
}

/**
 * Helper to compare ISO date strings safely
 */
function getTimestamp(dateStr?: string): number {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * Smart Non-Destructive Cloud Save with Inspection & Conflict Merging:
 * 1. Reads existing cloud documents first.
 * 2. If existing cloud data is present, preserves items not present locally (e.g. from another device).
 * 3. For items present in both local and cloud, inspects timestamps and keeps the newer version.
 * 4. Sanitizes all payloads (stripping any `undefined` properties).
 * 5. Returns the complete merged data so the local client can update its local store.
 */
export async function saveAllToCloud(
  userId: string,
  payload: {
    texts: TextItem[];
    blueprints: QueryBlueprint[];
    annotations: Annotation[];
    mirrorTranslations?: Record<string, MirrorTranslationData>;
    llmConfig: LLMConfig;
    readerSettings: ReaderSettings;
    scrollPositions: Record<string, any>;
  }
): Promise<{ 
  success: boolean; 
  syncedAt: string; 
  totalItems: number;
  mergedData: CloudUserData;
  addedFromCloudCount: { texts: number; annotations: number; blueprints: number };
}> {
  if (!userId) throw new Error('User must be signed in to save to Google Cloud');

  const nowIso = new Date().toISOString();

  // 1. Inspect existing cloud data first
  let existingCloud: CloudUserData | null = null;
  try {
    existingCloud = await loadAllFromCloud(userId);
  } catch (e) {
    console.warn('Could not inspect prior cloud data before save (may be first time):', e);
  }

  // Track how many items from cloud were preserved/merged into local
  let addedTextsFromCloud = 0;
  let addedAnnsFromCloud = 0;
  let addedBlueprintsFromCloud = 0;

  // 2. Smart Merge: Texts
  const textsMap = new Map<string, TextItem>();
  if (existingCloud && existingCloud.texts) {
    for (const cloudText of existingCloud.texts) {
      if (cloudText && cloudText.id) {
        textsMap.set(cloudText.id, cloudText);
      }
    }
  }

  for (const localText of payload.texts) {
    if (!localText || !localText.id) continue;
    const existing = textsMap.get(localText.id);
    if (!existing) {
      // New local text
      textsMap.set(localText.id, localText);
    } else {
      // Text exists in both: inspect which is newer
      const localTime = Math.max(getTimestamp(localText.updatedAt), getTimestamp(localText.createdAt));
      const cloudTime = Math.max(getTimestamp(existing.updatedAt), getTimestamp(existing.createdAt));
      if (localTime >= cloudTime) {
        textsMap.set(localText.id, localText);
      } else {
        // Cloud has newer edit from another client - preserve cloud version
        textsMap.set(localText.id, existing);
      }
    }
  }

  // Count texts that were in cloud but not originally in local payload
  const localTextIds = new Set(payload.texts.map((t) => t.id));
  for (const id of textsMap.keys()) {
    if (!localTextIds.has(id)) {
      addedTextsFromCloud++;
    }
  }

  const mergedTexts = Array.from(textsMap.values());

  // 3. Smart Merge: Blueprints
  const blueprintsMap = new Map<string, QueryBlueprint>();
  if (existingCloud && existingCloud.blueprints) {
    for (const cloudBp of existingCloud.blueprints) {
      if (cloudBp && cloudBp.id) {
        blueprintsMap.set(cloudBp.id, cloudBp);
      }
    }
  }

  for (const localBp of payload.blueprints) {
    if (!localBp || !localBp.id) continue;
    const existing = blueprintsMap.get(localBp.id);
    if (!existing) {
      blueprintsMap.set(localBp.id, localBp);
    } else {
      const localTime = Math.max(getTimestamp(localBp.updatedAt), getTimestamp(localBp.createdAt));
      const cloudTime = Math.max(getTimestamp(existing.updatedAt), getTimestamp(existing.createdAt));
      if (localTime >= cloudTime) {
        blueprintsMap.set(localBp.id, localBp);
      } else {
        blueprintsMap.set(localBp.id, existing);
      }
    }
  }

  const localBpIds = new Set(payload.blueprints.map((b) => b.id));
  for (const id of blueprintsMap.keys()) {
    if (!localBpIds.has(id)) {
      addedBlueprintsFromCloud++;
    }
  }

  const mergedBlueprints = Array.from(blueprintsMap.values());

  // 4. Smart Merge: Annotations
  const annotationsMap = new Map<string, Annotation>();
  if (existingCloud && existingCloud.annotations) {
    for (const cloudAnn of existingCloud.annotations) {
      if (cloudAnn && cloudAnn.id) {
        annotationsMap.set(cloudAnn.id, cloudAnn);
      }
    }
  }

  for (const localAnn of payload.annotations) {
    if (!localAnn || !localAnn.id) continue;
    annotationsMap.set(localAnn.id, localAnn);
  }

  const localAnnIds = new Set(payload.annotations.map((a) => a.id));
  for (const id of annotationsMap.keys()) {
    if (!localAnnIds.has(id)) {
      addedAnnsFromCloud++;
    }
  }

  const mergedAnnotations = Array.from(annotationsMap.values());

  // 5. Smart Merge: Mirror Translations
  const mergedMirrorTranslations: Record<string, MirrorTranslationData> = {
    ...(existingCloud?.mirrorTranslations || {}),
    ...(payload.mirrorTranslations || {}),
  };

  // 6. Smart Merge: Scroll Positions
  const mergedScrollPositions: Record<string, number> = {
    ...(existingCloud?.scrollPositions || {}),
    ...(payload.scrollPositions || {}),
  };

  // 7. Sanitized Settings & Config
  const mergedLlmConfig = sanitizeForFirestore<LLMConfig>({
    ...payload.llmConfig,
    ...(payload.llmConfig.customProviders ? { customProviders: payload.llmConfig.customProviders } : {})
  });

  const mergedReaderSettings = sanitizeForFirestore<ReaderSettings>(payload.readerSettings);

  // 8. Write to Firestore with batched chunking (up to 400 operations per batch)
  const initialBatch = writeBatch(db);

  // Settings and Config Document
  const settingsDocRef = doc(db, 'users', userId, 'settings', 'config');
  initialBatch.set(settingsDocRef, sanitizeForFirestore({
    llmConfig: mergedLlmConfig,
    readerSettings: mergedReaderSettings,
    scrollPositions: mergedScrollPositions,
    updatedAt: nowIso,
  }), { merge: true });

  // Mirrors Document
  const mirrorsDocRef = doc(db, 'users', userId, 'settings', 'mirrors');
  initialBatch.set(mirrorsDocRef, sanitizeForFirestore({
    mirrorTranslations: mergedMirrorTranslations,
    updatedAt: nowIso,
  }), { merge: true });

  // Meta Document
  const metaDocRef = doc(db, 'users', userId, 'meta', 'syncInfo');
  initialBatch.set(metaDocRef, sanitizeForFirestore({
    lastSyncedAt: nowIso,
    totalTexts: mergedTexts.length,
    totalAnnotations: mergedAnnotations.length,
    totalBlueprints: mergedBlueprints.length,
    lastClientDevice: getDeviceType(),
    updatedAt: serverTimestamp(),
  }), { merge: true });

  await initialBatch.commit();

  // Queue all items for rapid batch execution
  const writeOps: Array<{ ref: any; data: any }> = [];

  // Texts
  for (const text of mergedTexts) {
    const textRef = doc(db, 'users', userId, 'texts', text.id);
    writeOps.push({ ref: textRef, data: sanitizeForFirestore({ ...text, syncedAt: nowIso }) });
  }

  // Blueprints
  for (const bp of mergedBlueprints) {
    const bpRef = doc(db, 'users', userId, 'blueprints', bp.id);
    writeOps.push({ ref: bpRef, data: sanitizeForFirestore({ ...bp, syncedAt: nowIso }) });
  }

  // Annotations
  for (const ann of mergedAnnotations) {
    const annRef = doc(db, 'users', userId, 'annotations', ann.id);
    writeOps.push({ ref: annRef, data: sanitizeForFirestore({ ...ann, syncedAt: nowIso }) });
  }

  // Commit all queued items in parallel chunks of 400
  const BATCH_CHUNK_SIZE = 400;
  const chunkPromises: Promise<void>[] = [];

  for (let i = 0; i < writeOps.length; i += BATCH_CHUNK_SIZE) {
    const chunk = writeOps.slice(i, i + BATCH_CHUNK_SIZE);
    const chunkBatch = writeBatch(db);
    for (const op of chunk) {
      chunkBatch.set(op.ref, op.data, { merge: true });
    }
    chunkPromises.push(chunkBatch.commit());
  }

  if (chunkPromises.length > 0) {
    await Promise.all(chunkPromises);
  }

  const mergedData: CloudUserData = {
    texts: mergedTexts,
    blueprints: mergedBlueprints,
    annotations: mergedAnnotations,
    mirrorTranslations: mergedMirrorTranslations,
    llmConfig: mergedLlmConfig,
    readerSettings: mergedReaderSettings,
    scrollPositions: mergedScrollPositions,
    lastSyncedAt: nowIso,
  };

  const totalItems = mergedTexts.length + mergedBlueprints.length + mergedAnnotations.length;

  return { 
    success: true, 
    syncedAt: nowIso, 
    totalItems,
    mergedData,
    addedFromCloudCount: {
      texts: addedTextsFromCloud,
      annotations: addedAnnsFromCloud,
      blueprints: addedBlueprintsFromCloud,
    }
  };
}

/**
 * 1-Click Complete Load/Restore of all user state from Google Cloud Firestore
 */
export async function loadAllFromCloud(userId: string): Promise<CloudUserData | null> {
  if (!userId) throw new Error('User must be signed in to load from Google Cloud');

  // 1. Fetch Settings & Config
  const settingsDocRef = doc(db, 'users', userId, 'settings', 'config');
  const settingsSnap = await getDoc(settingsDocRef);
  const settingsData = settingsSnap.exists() ? settingsSnap.data() : null;

  // 2. Fetch Texts
  const textsCollRef = collection(db, 'users', userId, 'texts');
  const textsSnap = await getDocs(textsCollRef);
  const texts: TextItem[] = textsSnap.docs.map((d) => d.data() as TextItem);

  // 3. Fetch Blueprints
  const bpCollRef = collection(db, 'users', userId, 'blueprints');
  const bpSnap = await getDocs(bpCollRef);
  const blueprints: QueryBlueprint[] = bpSnap.docs.map((d) => d.data() as QueryBlueprint);

  // 4. Fetch Annotations
  const annCollRef = collection(db, 'users', userId, 'annotations');
  const annSnap = await getDocs(annCollRef);
  const annotations: Annotation[] = annSnap.docs.map((d) => d.data() as Annotation);

  // 5. Fetch Mirrors
  const mirrorsDocRef = doc(db, 'users', userId, 'settings', 'mirrors');
  const mirrorsSnap = await getDoc(mirrorsDocRef);
  const mirrorsData = mirrorsSnap.exists() ? mirrorsSnap.data() : null;

  // 6. Fetch Meta
  const metaDocRef = doc(db, 'users', userId, 'meta', 'syncInfo');
  const metaSnap = await getDoc(metaDocRef);
  const metaData = metaSnap.exists() ? metaSnap.data() : null;

  if (!settingsData && texts.length === 0 && blueprints.length === 0) {
    return null; // Empty cloud account
  }

  return {
    texts,
    blueprints,
    annotations,
    mirrorTranslations: mirrorsData?.mirrorTranslations || {},
    llmConfig: settingsData?.llmConfig,
    readerSettings: settingsData?.readerSettings,
    scrollPositions: settingsData?.scrollPositions || {},
    lastSyncedAt: metaData?.lastSyncedAt || new Date().toISOString(),
  };
}

/**
 * Real-time Single Text Cloud Sync
 */
export async function syncTextToCloud(userId: string, text: TextItem): Promise<void> {
  if (!userId) return;
  try {
    const textRef = doc(db, 'users', userId, 'texts', text.id);
    const sanitized = sanitizeForFirestore({ ...text, updatedAt: new Date().toISOString() });
    await setDoc(textRef, sanitized, { merge: true });
  } catch (err) {
    console.error('Error syncing text to cloud:', err);
  }
}

export async function deleteTextFromCloud(userId: string, textId: string): Promise<void> {
  if (!userId) return;
  try {
    const textRef = doc(db, 'users', userId, 'texts', textId);
    await deleteDoc(textRef);
  } catch (err) {
    console.error('Error deleting text from cloud:', err);
  }
}

/**
 * Real-time Single Blueprint Cloud Sync
 */
export async function syncBlueprintToCloud(userId: string, blueprint: QueryBlueprint): Promise<void> {
  if (!userId) return;
  try {
    const bpRef = doc(db, 'users', userId, 'blueprints', blueprint.id);
    const sanitized = sanitizeForFirestore({ ...blueprint, updatedAt: new Date().toISOString() });
    await setDoc(bpRef, sanitized, { merge: true });
  } catch (err) {
    console.error('Error syncing blueprint to cloud:', err);
  }
}

export async function deleteBlueprintFromCloud(userId: string, blueprintId: string): Promise<void> {
  if (!userId) return;
  try {
    const bpRef = doc(db, 'users', userId, 'blueprints', blueprintId);
    await deleteDoc(bpRef);
  } catch (err) {
    console.error('Error deleting blueprint from cloud:', err);
  }
}

/**
 * Real-time Single Incremental Annotation Cloud Sync
 * Uploads ONLY the single new translation without downloading, iterating, or uploading other library items.
 */
export async function syncAnnotationToCloud(userId: string, annotation: Annotation): Promise<string | null> {
  if (!userId || !annotation?.id) return null;
  const nowIso = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    const annRef = doc(db, 'users', userId, 'annotations', annotation.id);
    const sanitized = sanitizeForFirestore({ ...annotation, syncedAt: nowIso });
    batch.set(annRef, sanitized, { merge: true });

    // Also update meta syncInfo timestamp in the exact same lightweight batch
    const metaDocRef = doc(db, 'users', userId, 'meta', 'syncInfo');
    batch.set(metaDocRef, {
      lastSyncedAt: nowIso,
      lastClientDevice: getDeviceType(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await batch.commit();
    return nowIso;
  } catch (err) {
    console.error('Error incrementally syncing annotation to cloud:', err);
    return null;
  }
}

export async function deleteAnnotationFromCloud(userId: string, annotationId: string): Promise<void> {
  if (!userId) return;
  try {
    const annRef = doc(db, 'users', userId, 'annotations', annotationId);
    await deleteDoc(annRef);
  } catch (err) {
    console.error('Error deleting annotation from cloud:', err);
  }
}

/**
 * Real-time Single Mirror Translation (Calque) Cloud Sync
 */
export async function syncMirrorTranslationToCloud(
  userId: string, 
  mirrorData: MirrorTranslationData
): Promise<string | null> {
  if (!userId || !mirrorData?.textId) return null;
  const nowIso = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    const mirrorsDocRef = doc(db, 'users', userId, 'settings', 'mirrors');
    const sanitized = sanitizeForFirestore({ ...mirrorData, updatedAt: nowIso });
    
    batch.set(mirrorsDocRef, {
      mirrorTranslations: {
        [mirrorData.textId]: sanitized,
      },
      updatedAt: nowIso,
    }, { merge: true });

    // Also update meta syncInfo timestamp
    const metaDocRef = doc(db, 'users', userId, 'meta', 'syncInfo');
    batch.set(metaDocRef, {
      lastSyncedAt: nowIso,
      lastClientDevice: getDeviceType(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await batch.commit();
    return nowIso;
  } catch (err) {
    console.error('Error syncing mirror translation to cloud:', err);
    return null;
  }
}

export async function deleteMirrorTranslationFromCloud(
  userId: string, 
  textId: string
): Promise<void> {
  if (!userId || !textId) return;
  try {
    const mirrorsDocRef = doc(db, 'users', userId, 'settings', 'mirrors');
    const snap = await getDoc(mirrorsDocRef);
    if (snap.exists()) {
      const data = snap.data();
      const translations = { ...(data.mirrorTranslations || {}) };
      delete translations[textId];
      await setDoc(mirrorsDocRef, {
        mirrorTranslations: sanitizeForFirestore(translations),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }
  } catch (err) {
    console.error('Error deleting mirror translation from cloud:', err);
  }
}

/**
 * Real-time Settings Cloud Sync
 */
export async function syncSettingsToCloud(
  userId: string, 
  llmConfig: LLMConfig, 
  readerSettings: ReaderSettings
): Promise<void> {
  if (!userId) return;
  try {
    const settingsDocRef = doc(db, 'users', userId, 'settings', 'config');
    const sanitized = sanitizeForFirestore({
      llmConfig,
      readerSettings,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(settingsDocRef, sanitized, { merge: true });
  } catch (err) {
    console.error('Error syncing settings to cloud:', err);
  }
}

/**
 * Real-time Scroll Position Cloud Sync
 */
export async function syncScrollPositionToCloud(
  userId: string, 
  textId: string, 
  position: number
): Promise<void> {
  if (!userId || !textId) return;
  try {
    const settingsDocRef = doc(db, 'users', userId, 'settings', 'config');
    await setDoc(settingsDocRef, {
      [`scrollPositions.${textId}`]: Math.round(position),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.error('Error syncing scroll position to cloud:', err);
  }
}

/**
 * Get Cloud Sync Meta Summary
 */
export async function getCloudSyncMeta(userId: string): Promise<SyncMeta | null> {
  if (!userId) return null;
  try {
    const metaDocRef = doc(db, 'users', userId, 'meta', 'syncInfo');
    const snap = await getDoc(metaDocRef);
    return snap.exists() ? (snap.data() as SyncMeta) : null;
  } catch (err) {
    console.error('Error fetching cloud sync meta:', err);
    return null;
  }
}
