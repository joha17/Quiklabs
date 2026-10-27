/** Avisos y subtítulos de la práctica B02 (mismo estilo que las prácticas 2 a 6). */
import { useTranslation } from 'react-i18next';
import { useB02 } from './store';

export { Modal, HoldButton, fmtTime } from '../common/ui';

export function ToastsB02() {
  const { t } = useTranslation();
  const toasts = useB02((s) => s.toasts);
  const captions = useB02((s) => s.captions);
  const dismiss = useB02((s) => s.dismissToast);
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
