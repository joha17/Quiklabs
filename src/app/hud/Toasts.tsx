import { useLab } from '../store';
import { useTranslation } from 'react-i18next';

export function Toasts() {
  const { t } = useTranslation();
  const toasts = useLab((s) => s.toasts);
  const captions = useLab((s) => s.captions);
  const dismiss = useLab((s) => s.dismissToast);
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
