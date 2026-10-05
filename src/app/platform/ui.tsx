/**
 * Piezas comunes de la plataforma: mensajes de error legibles, fechas, barra superior de los paneles y el diálogo que
 * muestra una contraseña temporal una sola vez.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useShell } from '../shell';
import { useTheme } from '../theme';
import { ApiFailure } from './api';
import { usePlatform } from './session';
import './platform.css';

export function errorText(e: unknown): string {
  const code = e instanceof ApiFailure ? e.code : typeof e === 'string' ? e : 'ERROR';
  const detail = e instanceof ApiFailure ? e.detail : {};
  const key = `pf.errors.${code}`;
  return i18n.exists(key) ? i18n.t(key, detail) : i18n.t('pf.errors.default', { code });
}

export const fmtDate = (iso: string | null | undefined, time = false) =>
  iso ? new Date(iso).toLocaleString('es-CR', time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }) : '—';

/** ISO ↔ valor de <input type="datetime-local"> (hora local). */
export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => new Date(v).toISOString();

export const pct = (x: number) => `${Math.round(x * 100)}`;

/** Barra superior de los paneles: marca, usuario, tema y salir. */
export function PanelShell({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  const me = usePlatform((s) => s.me)!;
  const logout = usePlatform((s) => s.logout);
  const open = useShell((s) => s.open);
  const { dark, toggle } = useTheme();
  return (
    <div className="pf">
      <header className="pf-top">
        <a className="pf-brand" href="#" onClick={(e) => { e.preventDefault(); open(null); }}>
          <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M15 4h10v3h-1.5v9.5l9.6 16a3 3 0 0 1-2.6 4.5H9.5a3 3 0 0 1-2.6-4.5l9.6-16V7H15z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><path d="M12 25h16l4.4 7.4a1.5 1.5 0 0 1-1.3 2.3H8.9a1.5 1.5 0 0 1-1.3-2.3z" fill="#2b8c88" /></svg>
          {t('pf.brand')}
        </a>
        <span className="pf-top-title">{title}</span>
        <div className="pf-top-user">
          <span className="pf-user"><strong>{me.user.name}</strong><span className={`pf-role pf-role-${me.user.role}`}>{t(`pf.role.${me.user.role}`)}</span></span>
          <button type="button" className="btn small" onClick={toggle} aria-pressed={dark} aria-label={t('landing.nav.dark')}>{dark ? '☀' : '☾'}</button>
          <button type="button" className="btn small" onClick={() => void logout().then(() => open('login'))}>{t('pf.logout')}</button>
        </div>
      </header>
      <main className="pf-main">{children}</main>
    </div>
  );
}

export function TempPasswordDialog({ name, password, onClose }: { name: string; password: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="modal-back" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pf-temp-title">
        <h2 id="pf-temp-title" style={{ margin: 0 }}>{t('pf.admin.tempTitle')}</h2>
        <p style={{ margin: 0 }}>{t('pf.admin.tempLead', { name })}</p>
        <code className="pf-temp">{password}</code>
        <div className="foot" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(password).then(() => setCopied(true))}>{copied ? t('pf.admin.copied') : t('pf.admin.copy')}</button>
          <button type="button" className="btn primary" onClick={onClose} autoFocus>{t('pf.admin.close')}</button>
        </div>
      </div>
    </div>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'ok' | 'error'; children: ReactNode }) {
  return <div className={`pf-notice pf-notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

/** Descarga de un CSV generado en el navegador. */
export function downloadCsv(name: string, rows: Array<Array<string | number>>) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
