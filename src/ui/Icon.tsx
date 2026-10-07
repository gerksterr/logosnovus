import {
  Book,
  Check,
  Edit3,
  ExternalLink,
  Globe,
  Languages,
  Link,
  Pin,
  RefreshCw,
  ScrollText,
  Trash2,
  Volume2,
  type LucideProps,
} from 'lucide-react';
import type { ComponentType } from 'react';

const ICONS: Record<string, ComponentType<LucideProps>> = {
  book: Book,
  check: Check,
  edit: Edit3,
  external: ExternalLink,
  globe: Globe,
  languages: Languages,
  link: Link,
  pin: Pin,
  refresh: RefreshCw,
  scroll: ScrollText,
  trash: Trash2,
  volume: Volume2,
};

/** Icon by short name (menus are built in non-React code). */
export function Icon({ name, size = 16 }: { name?: string; size?: number }) {
  const C = name ? ICONS[name] : undefined;
  return C ? <C size={size} aria-hidden="true" /> : <span style={{ width: size, display: 'inline-block' }} />;
}
