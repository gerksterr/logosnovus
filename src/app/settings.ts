// Per-device preferences (not synced: a phone and a desktop want different sizes).

import { create } from 'zustand';

export type Theme = 'night' | 'ink' | 'sepia' | 'paper';
export type LibrarySort = 'added' | 'added-asc' | 'title' | 'recent' | 'custom';

export interface DeviceSettings {
  theme: Theme;
  font: 'serif' | 'sans' | 'mono';
  fontSize: number;
  lineHeight: number;
  width: number; // text column width in em
  justify: boolean;
  dimNotes: boolean; // dim [bracketed] apparatus
  lookup: 'ai' | 'dict';
  minimap: boolean;
  mirrorBar: boolean; // floating mode bar on desktop (always on for touch)
  sort: LibrarySort;
}

const DEFAULTS: DeviceSettings = {
  theme: 'night',
  font: 'serif',
  fontSize: 19,
  lineHeight: 1.75,
  width: 38,
  justify: false,
  dimNotes: true,
  lookup: 'ai',
  minimap: true,
  mirrorBar: false,
  sort: 'added',
};

const KEY = 'logosnovus.settings';

function load(): DeviceSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULTS;
  }
}

export const useSettings = create<DeviceSettings>(load);

export function setSetting<K extends keyof DeviceSettings>(key: K, value: DeviceSettings[K]) {
  useSettings.setState({ [key]: value } as Partial<DeviceSettings>);
  try {
    localStorage.setItem(KEY, JSON.stringify(useSettings.getState()));
  } catch {
    /* private mode: settings live for this session only */
  }
}

export const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
export const isWide = () => typeof innerWidth !== 'undefined' && innerWidth >= 1100;
