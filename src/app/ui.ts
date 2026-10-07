// Transient UI state shared across views: the translation sheet, the context
// menu and toasts. Nothing here is persisted.

import { create } from 'zustand';
import type { Target } from '../data/selectors';

export interface SheetState {
  target: Target;
  versionId?: string; // shown saved version (default: newest)
  queryId?: string; // running/finished query shown
  modelId?: string; // web mode: the chat site to use
  mode: 'view' | 'web' | 'dict';
}

export interface MenuItem {
  label: string;
  icon?: string;
  run: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export interface DialogState {
  kind: 'text' | 'confirm';
  title: string;
  value: string;
  ok: string;
  resolve: (v: string | null) => void;
}

interface UIState {
  sheet: SheetState | null;
  menu: { x: number; y: number; title?: string; items: MenuItem[] } | null;
  toasts: Toast[];
  dialog: DialogState | null;
}

export const useUI = create<UIState>(() => ({ sheet: null, menu: null, toasts: [], dialog: null }));

/** Small in-app prompt (no window.prompt: it blocks and looks foreign on Android). */
export function askText(title: string, value = '', ok = 'Save'): Promise<string | null> {
  return new Promise((resolve) => useUI.setState({ dialog: { kind: 'text', title, value, ok, resolve } }));
}
export function confirmDialog(title: string, ok = 'Delete'): Promise<boolean> {
  return new Promise((resolve) => useUI.setState({ dialog: { kind: 'confirm', title, value: '', ok, resolve: (v) => resolve(v != null) } }));
}

let toastId = 1;
export function toast(text: string, kind: Toast['kind'] = 'info', ms = kind === 'error' ? 7000 : 3000) {
  const id = toastId++;
  useUI.setState((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
  setTimeout(() => useUI.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

export const closeSheet = () => useUI.setState({ sheet: null });
export const closeMenu = () => useUI.setState({ menu: null });
