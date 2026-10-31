import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB07 } from './store';
import { gapLow, microscopeView } from '../../simulation/optical-world/world';

/**
 * HUD de seguridad de B07 (§11): EPP, separación objetivo–preparación, vidrio roto, derrames, equipos encendidos y
 * caja abierta, con las recuperaciones a la mano. Siempre visible, en todos los modos.
 */
export function SafetyPanelB07() {
  const { t } = useTranslation();
  useB07((s) => s.version);
  const rt = useB07((s) => s.runtime);
  const dispatch = useB07((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const low = gapLow(w);
  return (
    <aside className="p3-safety" aria-label={t('b07.safety.title')}>
      <div className="p3-safety-head">
        <strong>🛡 {t('b07.safety.title')}</strong>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      {open && (
        <>
          <dl className="p3-meters">
            <dt>{t('b07.safety.ppe')}</dt>
            <dd className={w.ppe ? 'ok' : 'pending'}>{w.ppe ? `● ${t('b07.safety.ppeOk')}` : `▲ ${t('b07.safety.ppeMissing')}`}</dd>
            <dt>{t('b07.safety.gap')}</dt>
            <dd className={low ? 'bad' : 'ok'}>{low ? `▲ ${t('b07.safety.gapLow')}` : `● ${t('b07.safety.gapOk')}`}</dd>
            <dt>{t('b07.safety.glass')}</dt>
            <dd className={w.shards > 0 ? 'bad' : 'ok'}>{w.shards > 0 ? `▲ ${t('b07.safety.shards')}` : `● ${t('b07.safety.noShards')}`}</dd>
            <dt>{t('b07.safety.spill')}</dt>
            <dd className={w.benchSpillMl > 0.005 ? 'pending' : 'ok'}>{w.benchSpillMl > 0.005 ? `▲ ${t('b07.safety.wet')}` : `● ${t('b07.safety.dry')}`}</dd>
            <dt>{t('b07.safety.power')}</dt>
            <dd className="ok">{t('b07.safety.powerState', { m: t(w.microscope.power ? 'b07.safety.on' : 'b07.safety.off') })}</dd>
          </dl>
          <div className="row">
            {low && <button className="btn small" onClick={() => dispatch({ type: 'turnCoarse', deltaTurns: -0.5 })}>▼ {t('b07.act.backOff')}</button>}
            {w.shards > 0 && <button className="btn small" onClick={() => dispatch({ type: 'cleanShards' })}>🗑 {t('b07.act.cleanShards')}</button>}
            {w.benchSpillMl > 0.005 && <button className="btn small" onClick={() => dispatch({ type: 'wipe', targetId: 'bench', toolId: 'pp' })}>🧻 {t('b07.act.wipeSpill')}</button>}
          </div>
        </>
      )}
    </aside>
  );
}

/** Banda roja persistente: explica el riesgo y ofrece la recuperación, sin modal (§11.2). */
export function SafetyBannerB07() {
  const { t } = useTranslation();
  useB07((s) => s.version);
  const rt = useB07((s) => s.runtime);
  const dispatch = useB07((s) => s.dispatch);
  const toast = useB07((s) => s.toast);
  if (!rt) return null;
  const w = rt.world;
  if (w.safety.stoppedByTeacher) {
    return (
      <div className="safety-banner" role="alertdialog">
        <strong>⏹ {t('p3.block.teacherTitle')}</strong>
        <span>{t('p3.block.teacher')}</span>
        <button className="btn" onClick={() => dispatch({ type: 'teacherStop', on: false })}>{t('p3.block.teacherResume')}</button>
      </div>
    );
  }
  const code = w.safety.block?.code ?? (gapLow(w) ? 'GAP_LOW' : null);
  if (!code) return null;
  const ack = () => {
    const r = dispatch({ type: 'acknowledge' });
    if (!r.ok && r.code) toast('warn', t(`b07.block.ack_${r.code}`));
  };
  const gap = microscopeView(w).gapMm;
  return (
    <div className="safety-banner" role="alert">
      <strong>⛔ {t(`b07.block.title_${code}`)}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>{t(`b07.block.${code}`)}</span>
      {(code === 'GAP_LOW' || code === 'COLLISION') && <button className="btn" onClick={() => dispatch({ type: 'turnCoarse', deltaTurns: -(code === 'COLLISION' ? 1.5 : 0.5) })}>▼ {t('b07.act.backOff')}</button>}
      {code === 'SHARDS' && <button className="btn" onClick={() => dispatch({ type: 'cleanShards' })}>🗑 {t('b07.act.cleanShards')}</button>}
      {code === 'SPILL' && <button className="btn" onClick={() => dispatch({ type: 'wipe', targetId: 'stage', toolId: 'pp' })}>🧻 {t('b07.act.wipeSpill')}</button>}
      {w.safety.block && <button className="btn" onClick={ack}>{t('p3.block.reset')}</button>}
      <span className="sr-only">{gap.toFixed(1)}</span>
    </div>
  );
}
