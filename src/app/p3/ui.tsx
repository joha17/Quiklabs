/**
 * Piezas de interfaz de la Práctica 3 con el mismo comportamiento y estilo que las de la Práctica 2:
 * diálogo modal accesible (foco atrapado, Esc), botón de acción mantenida y avisos/subtítulos.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useP3 } from './store';

export function Modal(props: { title: string; onClose?: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose.current) onClose.current();
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, [tabindex="0"]')];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget && props.onClose) props.onClose(); }}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={props.title}>
        <h2>{props.title}</h2>
        {props.children}
      </div>
    </div>
  );
}

/** Acción continua mientras se mantiene pulsado (ratón, táctil o teclado). */
export function HoldButton(props: { onStart: () => void; onStop: () => void; children: React.ReactNode; className?: string; disabled?: boolean; label?: string }) {
  const active = useRef(false);
  const cb = useRef(props);
  cb.current = props;
  const start = () => {
    if (active.current || cb.current.disabled) return;
    active.current = true;
    cb.current.onStart();
  };
  const stop = () => {
    if (!active.current) return;
    active.current = false;
    cb.current.onStop();
  };
  useEffect(() => () => stop(), []);
  return (
    <button
      className={`btn ${props.className ?? ''}`}
      disabled={props.disabled}
      aria-label={props.label}
      onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); start(); }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } }}
      onBlur={stop}
    >
      {props.children}
    </button>
  );
}

export function Toasts3() {
  const { t } = useTranslation();
  const toasts = useP3((s) => s.toasts);
  const captions = useP3((s) => s.captions);
  const dismiss = useP3((s) => s.dismissToast);
  return (
    <>
      <div className="toasts" aria-live="polite" aria-relevant="additions">
        {toasts.map((x) => (
          <div key={x.id} className={`toast ${x.level}`} role={x.level === 'critical' || x.level === 'alert' ? 'alert' : 'status'}>
            <span>{x.level === 'critical' ? '⛔ ' : x.level === 'alert' ? '⚠ ' : x.level === 'warn' ? '• ' : 'ℹ '}{x.text}</span>
            <button className="x" aria-label={t('common.close')} onClick={() => dismiss(x.id)}>×</button>
          </div>
        ))}
      </div>
      <div className="captions" aria-hidden="true">
        {captions.map((c) => <span key={c.id} className="caption">{c.text}</span>)}
      </div>
    </>
  );
}

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}
