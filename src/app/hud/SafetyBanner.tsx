import { useTranslation } from 'react-i18next';
import { useLab } from '../store';

/** Bloqueos críticos visibles (§10.2): detienen la acción, explican el riesgo y ofrecen la recuperación. */
export function SafetyBanner() {
  const { t } = useTranslation();
  useLab((s) => s.version);
  const rt = useLab((s) => s.runtime);
  const dispatch = useLab((s) => s.dispatch);
  const toast = useLab((s) => s.toast);
  if (!rt) return null;
  const w = rt.world;
  if (w.safety.halted) {
    return (
      <div className="safety-banner" role="alertdialog" aria-labelledby="incident-title">
        <strong id="incident-title">⛔ {t('block.incidentTitle')}</strong>
        <span>{t('block.incident')}</span>
        {w.devices.hotplate.powerPct > 0 && <button className="btn" onClick={() => dispatch({ type: 'setHotplatePower', pct: 0 })}>0 %</button>}
        <button className="btn" onClick={() => {
          const r = dispatch({ type: 'acknowledgeIncident' });
          if (!r.ok) toast('warn', t('block.plateOff'));
        }}>{t('block.ack')}</button>
      </div>
    );
  }
  const b = w.safety.block;
  if (!b) return null;
  return (
    <div className="safety-banner" role="alert">
      <strong>⛔ {t('block.title')}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>{t(`block.${b.code}`)}</span>
      {b.code === 'SPILL_UNCLEANED' && <button className="btn" onClick={() => dispatch({ type: 'cleanSpill' })}>{t('act.cleanSpill')}</button>}
    </div>
  );
}
