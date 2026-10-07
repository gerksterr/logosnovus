import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBackClose } from '../app/router';
import { closeMenu, useUI } from '../app/ui';
import { useStore } from '../data/store';
import { Icon } from './Icon';

/**
 * Centered dialog (full screen on phones). Back button and Esc close it.
 * `dismissable` = a click on the backdrop closes it; keep it false for forms
 * so typed input is never lost by a stray tap.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
  dismissable = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  dismissable?: boolean;
}) {
  useBackClose(true, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="backdrop" onMouseDown={(e) => dismissable && e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Side panel on wide screens, bottom sheet on phones. Closes on backdrop tap (read-only content). */
export function Drawer({ title, onClose, children, actions }: { title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useBackClose(true, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="backdrop drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer">
        <div className="modal-head">
          <h2>{title}</h2>
          {actions}
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

/** Global context menu (right click on desktop, "More" on phones). */
export function ContextMenu() {
  const menu = useUI((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useBackClose(!!menu, closeMenu);
  useEffect(() => {
    if (!menu) return setPos(null);
    const el = ref.current;
    const w = el?.offsetWidth ?? 240;
    const h = el?.offsetHeight ?? 300;
    setPos({ left: Math.max(8, Math.min(menu.x, innerWidth - w - 8)), top: Math.max(8, Math.min(menu.y, innerHeight - h - 8)) });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [menu]);
  if (!menu) return null;
  return createPortal(
    <div className="menu-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeMenu()} onContextMenu={(e) => (e.preventDefault(), closeMenu())}>
      <div ref={ref} className="menu" style={pos ?? { visibility: 'hidden' }} role="menu">
        {menu.title && <div className="menu-title">{menu.title}</div>}
        {menu.items.map((it, i) => (
          <button
            key={i}
            role="menuitem"
            className={it.danger ? 'danger' : undefined}
            disabled={it.disabled}
            onClick={() => {
              closeMenu();
              it.run();
            }}
          >
            <Icon name={it.icon} size={16} />
            {it.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

export function Dialogs() {
  const d = useUI((s) => s.dialog);
  const [value, setValue] = useState('');
  useEffect(() => setValue(d?.value ?? ''), [d]);
  if (!d) return null;
  const finish = (v: string | null) => {
    useUI.setState({ dialog: null });
    d.resolve(v);
  };
  return (
    <Modal
      title={d.title}
      onClose={() => finish(null)}
      footer={
        <div className="row end">
          <button className="btn ghost" onClick={() => finish(null)}>
            Cancel
          </button>
          <button className={`btn primary${d.kind === 'confirm' && d.ok === 'Delete' ? ' danger-fill' : ''}`} onClick={() => finish(value)}>
            {d.ok}
          </button>
        </div>
      }
    >
      {d.kind === 'text' && (
        <textarea
          className="input"
          rows={4}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && finish(value)}
        />
      )}
    </Modal>
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const saveError = useStore((s) => s.saveError);
  return (
    <div className="toasts" aria-live="polite">
      {saveError && <div className="toast error">{saveError}</div>}
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
