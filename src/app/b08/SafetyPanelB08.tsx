import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB08 } from './store';
import { gapLow, microscopeView } from '../../simulation/optical-world/world';

/**
 * HUD de seguridad de B08 (§11): EPP, separación objetivo–preparación, vidrio roto, derrames, equipos encendidos y
 * caja abierta, con las recuperaciones a la mano. Siempre visible, en todos los modos.
 */
export function SafetyPanelB08() {
  const { t } = useTranslation();
  useB08((s) => s.version);
  const rt = useB08((s) => s.runtime);
  const dispatch = useB08((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const low = gapLow(w);
  return (
    <aside className="p3-safety" aria-label={t('b08.safety.title')}>
      <div className="p3-safety-head">
        <strong>🛡 {t('b08.safety.title')}</strong>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      {open && (
        <>
          <dl className="p3-meters">
            <dt>{t('b08.safety.ppe')}</dt>
            <dd className={w.ppe ? 'ok' : 'pending'}>{w.ppe ? `● ${t('b08.safety.ppeOk')}` : `▲ ${t('b08.safety.ppeMissing')}`}</dd>
            <dt>{t('b08.safety.gap')}</dt>
            <dd className={low ? 'bad' : 'ok'}>{low ? `▲ ${t('b08.safety.gapLow')}` : `● ${t('b08.safety.gapOk')}`}</dd>
            <dt>{t('b08.safety.glass')}</dt>
            <dd className={w.shards > 0 ? 'bad' : 'ok'}>{w.shards > 0 ? `▲ ${t('b08.safety.shards')}` : `● ${t('b08.safety.noShards')}`}</dd>
            <dt>{t('b08.safety.spill')}</dt>
            <dd className={w.benchSpillMl > 0.005 ? 'pending' : 'ok'}>{w.benchSpillMl > 0.005 ? `▲ ${t('b08.safety.wet')}` : `● ${t('b08.safety.dry')}`}</dd>
            <dt>{t('b08.safety.power')}</dt>
            <dd className="ok">{t('b08.safety.powerState', { m: t(w.microscope.power ? 'b08.safety.on' : 'b08.safety.off') })}</dd>
          </dl>
          <div className="row">
            {low && <button className="btn small" onClick={() => dispatch({ type: 'turnCoarse', deltaTurns: -0.5 })}>▼ {t('b08.act.backOff')}</button>}
            {w.shards > 0 && <button className="btn small" onClick={() => dispatch({ type: 'cleanShards' })}>🗑 {t('b08.act.cleanShards')}</button>}
            {w.benchSpillMl > 0.005 && <button className="btn small" onClick={() => dispatch({ type: 'wipe', targetId: 'bench', toolId: 'pp' })}>🧻 {t('b08.act.wipeSpill')}</button>}
          </div>
        </>
      )}
    </aside>
  );
}

/** Banda roja persistente: explica el riesgo y ofrece la recuperación, sin modal (§11.2). */
export function SafetyBannerB08() {
  const { t } = useTranslation();
  useB08((s) => s.version);
  const rt = useB08((s) => s.runtime);
  const dispatch = useB08((s) => s.dispatch);
  const toast = useB08((s) => s.toast);
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
    if (!r.ok && r.code) toast('warn', t(`b08.block.ack_${r.code}`));
  };
  const gap = microscopeView(w).gapMm;
  return (
    <div className="safety-banner" role="alert">
      <strong>⛔ {t(`b08.block.title_${code}`)}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>{t(`b08.block.${code}`)}</span>
      {(code === 'GAP_LOW' || code === 'COLLISION') && <button className="btn" onClick={() => dispatch({ type: 'turnCoarse', deltaTurns: -(code === 'COLLISION' ? 1.5 : 0.5) })}>▼ {t('b08.act.backOff')}</button>}
      {code === 'SHARDS' && <button className="btn" onClick={() => dispatch({ type: 'cleanShards' })}>🗑 {t('b08.act.cleanShards')}</button>}
      {code === 'SPILL' && <button className="btn" onClick={() => dispatch({ type: 'wipe', targetId: 'stage', toolId: 'pp' })}>🧻 {t('b08.act.wipeSpill')}</button>}
      {w.safety.block && <button className="btn" onClick={ack}>{t('p3.block.reset')}</button>}
      <span className="sr-only">{gap.toFixed(1)}</span>
    </div>
  );
}
