import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB06 } from './store';
import { gapLow, microscopeView } from '../../simulation/optical-world/world';

/**
 * HUD de seguridad de B06 (§11): EPP, separación objetivo–preparación, vidrio roto, derrames, equipos encendidos y
 * caja abierta, con las recuperaciones a la mano. Siempre visible, en todos los modos.
 */
export function SafetyPanelB06() {
  const { t } = useTranslation();
  useB06((s) => s.version);
  const rt = useB06((s) => s.runtime);
  const dispatch = useB06((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const low = gapLow(w);
  return (
    <aside className="p3-safety" aria-label={t('b06.safety.title')}>
      <div className="p3-safety-head">
        <strong>🛡 {t('b06.safety.title')}</strong>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      {open && (
        <>
          <dl className="p3-meters">
            <dt>{t('b06.safety.ppe')}</dt>
            <dd className={w.ppe ? 'ok' : 'pending'}>{w.ppe ? `● ${t('b06.safety.ppeOk')}` : `▲ ${t('b06.safety.ppeMissing')}`}</dd>
            <dt>{t('b06.safety.gap')}</dt>
            <dd className={low ? 'bad' : 'ok'}>{low ? `▲ ${t('b06.safety.gapLow')}` : `● ${t('b06.safety.gapOk')}`}</dd>
            <dt>{t('b06.safety.glass')}</dt>
            <dd className={w.shards > 0 ? 'bad' : 'ok'}>{w.shards > 0 ? `▲ ${t('b06.safety.shards')}` : `● ${t('b06.safety.noShards')}`}</dd>
            <dt>{t('b06.safety.spill')}</dt>
            <dd className={w.benchSpillMl > 0.005 ? 'pending' : 'ok'}>{w.benchSpillMl > 0.005 ? `▲ ${t('b06.safety.wet')}` : `● ${t('b06.safety.dry')}`}</dd>
            <dt>{t('b06.safety.power')}</dt>
            <dd className="ok">{t('b06.safety.powerState', { m: t(w.microscope.power ? 'b06.safety.on' : 'b06.safety.off'), s: t(w.stereo.power ? 'b06.safety.on' : 'b06.safety.off') })}</dd>
          </dl>
          <div className="row">
            {low && <button className="btn small" onClick={() => dispatch({ type: 'turnCoarse', deltaTurns: -0.5 })}>▼ {t('b06.act.backOff')}</button>}
            {w.shards > 0 && <button className="btn small" onClick={() => dispatch({ type: 'cleanShards' })}>🗑 {t('b06.act.cleanShards')}</button>}
            {w.benchSpillMl > 0.005 && <button className="btn small" onClick={() => dispatch({ type: 'wipe', targetId: 'bench', toolId: 'pp' })}>🧻 {t('b06.act.wipeSpill')}</button>}
          </div>
        </>
      )}
    </aside>
  );
}

/** Banda roja persistente: explica el riesgo y ofrece la recuperación, sin modal (§11.2). */
export function SafetyBannerB06() {
  const { t } = useTranslation();
  useB06((s) => s.version);
  const rt = useB06((s) => s.runtime);
  const dispatch = useB06((s) => s.dispatch);
  const toast = useB06((s) => s.toast);
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
    if (!r.ok && r.code) toast('warn', t(`b06.block.ack_${r.code}`));
  };
  const gap = microscopeView(w).gapMm;
  return (
    <div className="safety-banner" role="alert">
      <strong>⛔ {t(`b06.block.title_${code}`)}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>{t(`b06.block.${code}`)}</span>
      {(code === 'GAP_LOW' || code === 'COLLISION') && <button className="btn" onClick={() => dispatch({ type: 'turnCoarse', deltaTurns: -(code === 'COLLISION' ? 1.5 : 0.5) })}>▼ {t('b06.act.backOff')}</button>}
      {code === 'SHARDS' && <button className="btn" onClick={() => dispatch({ type: 'cleanShards' })}>🗑 {t('b06.act.cleanShards')}</button>}
      {code === 'SPILL' && <button className="btn" onClick={() => dispatch({ type: 'wipe', targetId: 'stage', toolId: 'pp' })}>🧻 {t('b06.act.wipeSpill')}</button>}
      {w.safety.block && <button className="btn" onClick={ack}>{t('p3.block.reset')}</button>}
      <span className="sr-only">{gap.toFixed(1)}</span>
    </div>
  );
}
