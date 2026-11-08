/** Avisos y subtítulos de F101 (mismo estilo que las demás prácticas). */
import { useTranslation } from 'react-i18next';
import { useF101 } from './store';

export { Modal, HoldButton, fmtTime } from '../common/ui';

export function ToastsF101() {
  const { t } = useTranslation();
  const toasts = useF101((s) => s.toasts);
  const captions = useF101((s) => s.captions);
  const dismiss = useF101((s) => s.dismissToast);
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
