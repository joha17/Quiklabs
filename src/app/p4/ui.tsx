/** Avisos y subtítulos de la Práctica 4 (mismo estilo que las prácticas 2 y 3). */
import { useTranslation } from 'react-i18next';
import { useP4 } from './store';

export { Modal, HoldButton, fmtTime } from '../common/ui';

export function Toasts4() {
  const { t } = useTranslation();
  const toasts = useP4((s) => s.toasts);
  const captions = useP4((s) => s.captions);
  const dismiss = useP4((s) => s.dismissToast);
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
