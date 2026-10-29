import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB05 } from './store';
import { gapLow, microscopeView } from '../../simulation/optical-world/world';
import { heatSourcesOn } from '../../simulation/enz-world/world';

/**
 * HUD de seguridad de B05 (§11): EPP, separación objetivo–preparación, vidrio roto, derrames, fuentes térmicas
 * encendidas, tubos con mezcla sin descartar y presión atrapada, con las recuperaciones a la mano. Siempre visible.
 */
export function SafetyPanelB05() {
  const { t } = useTranslation();
  useB05((s) => s.version);
  const rt = useB05((s) => s.runtime);
  const dispatch = useB05((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const E = w.enz;
  const low = gapLow(w);
  const wet = w.benchSpillMl > 0.005 || E.vessels.spill.volumeMl > 0.05;
  const heat = heatSourcesOn(w);
  const pending = Object.entries(E.tubes).some(([id, x]) => x.sources.length > 0 && !x.discarded && E.vessels[id].volumeMl > 0.05);
  const pressure = Object.values(E.o2.trapped).some((x) => x > 1e-6);
  return (
    <aside className="p3-safety" aria-label={t('b02.safety.title')}>
      <div className="p3-safety-head">
        <strong>🛡 {t('b02.safety.title')}</strong>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      {open && (
        <>
          <dl className="p3-meters">
            <dt>{t('b02.safety.ppe')}</dt>
            <dd className={w.ppe ? 'ok' : 'pending'}>{w.ppe ? `● ${t('b02.safety.ppeOk')}` : `▲ ${t('b02.safety.ppeMissing')}`}</dd>
            <dt>{t('b02.safety.gap')}</dt>
            <dd className={low ? 'bad' : 'ok'}>{low ? `▲ ${t('b02.safety.gapLow')}` : `● ${t('b02.safety.gapOk')}`}</dd>
            <dt>{t('b02.safety.glass')}</dt>
            <dd className={w.shards > 0 ? 'bad' : 'ok'}>{w.shards > 0 ? `▲ ${t('b02.safety.shards')}` : `● ${t('b02.safety.noShards')}`}</dd>
            <dt>{t('b02.safety.spill')}</dt>
            <dd className={wet ? 'pending' : 'ok'}>{wet ? `▲ ${t('b02.safety.wet')}` : `● ${t('b02.safety.dry')}`}</dd>
            <dt>{t('b05.safety.heat')}</dt>
            <dd className={heat.length ? 'pending' : 'ok'}>{heat.length ? `▲ ${t('b05.safety.heatOn', { n: heat.length })}` : `● ${t('b05.safety.heatOff')}`}</dd>
            <dt>{t('b05.safety.pressure')}</dt>
            <dd className={pressure ? 'bad' : 'ok'}>{pressure ? `▲ ${t('b05.safety.pressureOn')}` : `● ${t('b05.safety.pressureOk')}`}</dd>
            <dt>{t('b05.safety.chem')}</dt>
            <dd className={pending ? 'pending' : 'ok'}>{pending ? `▲ ${t('b05.safety.tubesPending')}` : `● ${t('b05.safety.tubesOk')}`}</dd>
          </dl>
          <div className="row">
            {low && <button className="btn small" onClick={() => dispatch({ type: 'turnCoarse', deltaTurns: -0.5 })}>▼ {t('b02.act.backOff')}</button>}
            {w.shards > 0 && <button className="btn small" onClick={() => dispatch({ type: 'cleanShards' })}>🗑 {t('b02.act.cleanShards')}</button>}
            {wet && <button className="btn small" onClick={() => dispatch({ type: 'wipe', targetId: 'bench', toolId: 'pp' })}>🧻 {t('b02.act.wipeSpill')}</button>}
          </div>
        </>
      )}
    </aside>
  );
}

/** Banda roja persistente: explica el riesgo y ofrece la recuperación, sin modal (§11.2). */
export function SafetyBannerB05() {
  const { t } = useTranslation();
  useB05((s) => s.version);
  const rt = useB05((s) => s.runtime);
  const dispatch = useB05((s) => s.dispatch);
  const toast = useB05((s) => s.toast);
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
  const own = t(`b05.block.title_${code}`) !== `b05.block.title_${code}`;
  const ack = () => {
    const r = dispatch({ type: 'acknowledge' });
    if (!r.ok && r.code) toast('warn', t(own ? `b05.block.ack_${r.code}` : `b02.block.ack_${r.code}`));
  };
  const gap = microscopeView(w).gapMm;
  return (
    <div className="safety-banner" role="alert">
      <strong>⛔ {t(own ? `b05.block.title_${code}` : `b02.block.title_${code}`)}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>{t(own ? `b05.block.${code}` : `b02.block.${code}`)}</span>
      {(code === 'GAP_LOW' || code === 'COLLISION') && <button className="btn" onClick={() => dispatch({ type: 'turnCoarse', deltaTurns: -(code === 'COLLISION' ? 1.5 : 0.5) })}>▼ {t('b02.act.backOff')}</button>}
      {code === 'SHARDS' && <button className="btn" onClick={() => dispatch({ type: 'cleanShards' })}>🗑 {t('b02.act.cleanShards')}</button>}
      {(code === 'SPILL' || code === 'HOT') && <button className="btn" onClick={() => dispatch({ type: 'wipe', targetId: code === 'HOT' ? 'bench' : 'stage', toolId: 'pp' })}>🧻 {t('b02.act.wipeSpill')}</button>}
      {code === 'PRESSURE' && <button className="btn" onClick={() => {
        for (const id of Object.keys(w.enz.o2.trapped)) dispatch({ type: 'stopperTube', tubeId: id, closed: false });
        dispatch({ type: 'setStopcock', open: true });
      }}>🔓 {t('b05.act.release')}</button>}
      {code === 'IGNITION' && <button className="btn" onClick={() => dispatch({ type: 'setBurner', on: false })}>🔥✕ {t('b05.act.burnerOff')}</button>}
      {w.safety.block && <button className="btn" onClick={ack}>{t('p3.block.reset')}</button>}
      <span className="sr-only">{gap.toFixed(1)}</span>
    </div>
  );
}
