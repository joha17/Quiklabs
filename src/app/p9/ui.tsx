/** Avisos y subtítulos de la Práctica 9 (mismo estilo que las prácticas 2 a 6). */
import { useTranslation } from 'react-i18next';
import { useP09 } from './store';

export { Modal, HoldButton, fmtTime } from '../common/ui';

export function Toasts09() {
  const { t } = useTranslation();
  const toasts = useP09((s) => s.toasts);
  const captions = useP09((s) => s.captions);
  const dismiss = useP09((s) => s.dismissToast);
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
