// ============================================================================
// [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS]
// Temporary migration bridge for v1 global chats -> v2 per-translation scoped chats.
// In v1, LLM translation chats were keyed globally by targetText or calque_${textId}.
// In v2, LLM translation chats belong strictly to a specific translation version (ann_${id}).
// Delete this file and its references once all users have migrated their legacy data.
// ============================================================================

import { Annotation, TextItem, TranslationChatMessage } from '../types';
import { 
  getAllStoredDecipherChats, 
  saveDecipherChat, 
  updateAnnotationConversation, 
  getStoredAnnotations,
  getStoredCalqueHistory,
  updateCalqueHistoryConversation
} from './storageService';
import { normalizeForMatch } from '../utils/textUtils';

const STORAGE_KEY_DECIPHER_CHATS = 'symbolic_decipher_chats_v1';

/**
 * Returns true if a key in symbolic_decipher_chats_v1 is a legacy v1 unmigrated chat.
 * Legacy keys are plain target text (e.g. "logos", "1 ἴδετε...") or "calque_${textId}" (not "calque_hist_...").
 */
export function isLegacyChatKey(key: string): boolean {
  if (!key) return false;
  const k = key.trim().toLowerCase();
  if (k.startsWith('ann_')) return false;
  if (k.startsWith('unsaved_trans_')) return false;
  if (k.startsWith('calque_hist_')) return false;
  if (k.startsWith('calque_trans_')) return false;
  if (k.startsWith('migrated_')) return false;
  return true;
}

/**
 * Retrieves all legacy unmigrated translation chats currently in storage.
 */
export function getLegacyUnmigratedChats(): Record<string, TranslationChatMessage[]> {
  const all = getAllStoredDecipherChats();
  const legacy: Record<string, TranslationChatMessage[]> = {};
  for (const [key, msgs] of Object.entries(all)) {
    if (isLegacyChatKey(key) && Array.isArray(msgs) && msgs.length > 0) {
      legacy[key] = msgs;
    }
  }
  return legacy;
}

/**
 * Checks if there is a pending legacy unmigrated chat for a specific target text.
 */
export function getLegacyChatForTarget(targetText: string): TranslationChatMessage[] | null {
  if (!targetText) return null;
  const all = getAllStoredDecipherChats();
  const cleanKey = targetText.trim().toLowerCase();
  const normKey = normalizeForMatch(targetText);

  for (const [key, msgs] of Object.entries(all)) {
    if (!isLegacyChatKey(key) || !Array.isArray(msgs) || msgs.length === 0) continue;
    if (key === cleanKey || normalizeForMatch(key) === normKey) {
      return msgs;
    }
  }
  return null;
}

/**
 * Manually assign a legacy chat to a specific translation annotation chosen by the user.
 * [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS]
 */
export function assignLegacyChatToAnnotation(
  targetText: string,
  annotationId: string
): Annotation[] {
  const msgs = getLegacyChatForTarget(targetText);
  if (!msgs || msgs.length === 0) return getStoredAnnotations();

  // Save to the specific translation annotation
  saveDecipherChat(`ann_${annotationId}`, msgs);
  const updatedAnnotations = updateAnnotationConversation(annotationId, msgs);

  // Remove legacy unassigned chat key from storage
  deleteLegacyChatKey(targetText);

  return updatedAnnotations;
}

/**
 * Dismiss a legacy chat so the user is not prompted again for this target text.
 * [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS]
 */
export function dismissLegacyChat(targetText: string): void {
  deleteLegacyChatKey(targetText);
}

/**
 * Deletes a legacy chat key matching the target text from localStorage.
 */
function deleteLegacyChatKey(targetText: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DECIPHER_CHATS);
    if (!raw) return;
    const all = JSON.parse(raw);
    const cleanKey = targetText.trim().toLowerCase();
    const normKey = normalizeForMatch(targetText);

    let changed = false;
    for (const key of Object.keys(all)) {
      if (isLegacyChatKey(key) && (key === cleanKey || normalizeForMatch(key) === normKey)) {
        delete all[key];
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(STORAGE_KEY_DECIPHER_CHATS, JSON.stringify(all));
    }
  } catch (err) {
    console.error('Failed to remove legacy chat key:', err);
  }
}

/**
 * Automatic migration pass:
 * Scans all legacy chats.
 * - If there is ONLY ONE matching translation annotation for a legacy chat,
 *   automatically applies the chat to that translation!
 * - If there is only one calque history entry for a legacy calque chat,
 *   automatically applies the chat to that calque entry!
 * - If there are multiple translations, leaves the legacy key untouched so the UI
 *   can offer the user to pick which translation it originally belonged to.
 * 
 * [MIGRATION-V1-TO-V2: MARKED FOR DELETION IN FUTURE VERSIONS]
 */
export function runAutoLegacyChatMigration(
  providedAnnotations?: Annotation[],
  _providedTexts?: TextItem[]
): {
  migratedCount: number;
  pendingPickerCount: number;
  updatedAnnotations: Annotation[];
} {
  const currentAnns = providedAnnotations || getStoredAnnotations();
  const legacyChats = getLegacyUnmigratedChats();
  const legacyKeys = Object.keys(legacyChats);

  if (legacyKeys.length === 0) {
    return {
      migratedCount: 0,
      pendingPickerCount: 0,
      updatedAnnotations: currentAnns,
    };
  }

  let migratedCount = 0;
  let pendingPickerCount = 0;
  let workingAnnotations = [...currentAnns];

  for (const key of legacyKeys) {
    const msgs = legacyChats[key];
    if (!msgs || msgs.length === 0) continue;

    // 1. Calque chats: "calque_${textId}"
    if (key.startsWith('calque_')) {
      const textId = key.replace('calque_', '');
      const calqueHistory = getStoredCalqueHistory(textId);
      if (calqueHistory.length === 1) {
        // Exactly one calque history entry - auto-migrate to it!
        const targetEntry = calqueHistory[0];
        saveDecipherChat(`calque_${targetEntry.id}`, msgs);
        updateCalqueHistoryConversation(targetEntry.id, msgs);
        deleteLegacyChatKey(key);
        migratedCount++;
      } else if (calqueHistory.length > 1) {
        pendingPickerCount++;
      }
      continue;
    }

    // 2. Decipher word/passage translation chats:
    const normKey = normalizeForMatch(key);
    const matchingAnns = workingAnnotations.filter(
      (a) => a.target.trim().toLowerCase() === key || normalizeForMatch(a.target) === normKey
    );

    if (matchingAnns.length === 1) {
      // Exactly one matching translation! Apply it automatically!
      const targetAnn = matchingAnns[0];
      saveDecipherChat(`ann_${targetAnn.id}`, msgs);
      workingAnnotations = updateAnnotationConversation(targetAnn.id, msgs);
      deleteLegacyChatKey(key);
      migratedCount++;
    } else if (matchingAnns.length > 1) {
      // Multiple translations exist for this text!
      // Keep legacy chat in storage so DecipherBottomSheet offers the user to pick which translation it belongs to.
      pendingPickerCount++;
    }
  }

  return {
    migratedCount,
    pendingPickerCount,
    updatedAnnotations: workingAnnotations,
  };
}
