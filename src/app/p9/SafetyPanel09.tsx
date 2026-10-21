import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP09 } from './store';
import { massG } from '../../simulation/cation-analysis-world/species';
import { flowStatus, sashOK } from '../../simulation/cation-analysis-world/world';

/**
 * HUD de seguridad de la Práctica 9 (§10): EPP, extracción de la campana, altura de la mampara, luz local, llama,
 * centrífuga y derrames, con las recuperaciones a la mano. El aviso de que la llama y el vidrio de reloj son una
 * representación VIRTUAL está siempre visible, en todos los modos (no hay instrucciones de combustible ni encendido real).
 */
export function SafetyPanel09() {
  const { t } = useTranslation();
  useP09((s) => s.version);
  const rt = useP09((s) => s.runtime);
  const dispatch = useP09((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const bench = massG(w.outside.bench);
  const flow = flowStatus(w);
  const sash = sashOK(w);
  const c = w.centrifuge;
  return (
    <aside className="p3-safety" aria-label={t('p9.safety.title')}>
      <div className="p3-safety-head">
        <strong>🛡 {t('p9.safety.title')}</strong>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      <p className="virtual-note" role="note">⚠ {t('p9.safety.virtualNote')}</p>
      {open && (
        <>
          <dl className="p3-meters">
            <dt>{t('p9.safety.ppe')}</dt>
            <dd className={w.ppe ? 'ok' : 'pending'}>{w.ppe ? `● ${t('p9.safety.ppeOk')}` : `▲ ${t('p9.safety.ppeMissing')}`}</dd>
            <dt>{t('p9.safety.flow')}</dt>
            <dd className={flow === 'valid' ? 'ok' : 'bad'}>{flow === 'valid' ? '● ' : '▲ '}{t(`p9.flow.${flow}`)}</dd>
            <dt>{t('p9.safety.sash')}</dt>
            <dd className={sash ? 'ok' : 'bad'}>{sash ? '● ' : '▲ '}{t('p9.safety.sashCm', { cm: Math.round(w.hood.sashCm), max: w.params.sashMaxCm })}</dd>
            <dt>{t('p9.safety.light')}</dt>
            <dd className="ok">{t('p9.safety.lightPct', { pct: w.hood.lightPct })}</dd>
            <dt>{t('p9.safety.flame')}</dt>
            <dd className={w.flame.ignited ? 'pending' : 'ok'}>{w.flame.ignited ? `▲ ${t('p9.safety.flameOn')}` : `● ${t('p9.safety.flameOff')}`}</dd>
            <dt>{t('p9.safety.centrifuge')}</dt>
            <dd className={c.rpm > 1 ? 'pending' : 'ok'}>{c.rpm > 1 ? `▲ ${t('p9.safety.spinning')}` : `● ${t('p9.safety.stopped')}`}</dd>
            {w.flame.glassCracked && <dt>{t('p9.safety.glass')}</dt>}
            {w.flame.glassCracked && <dd className="bad">▲ {t('p9.safety.glassCracked')}</dd>}
            <dt>{t('p9.safety.bench')}</dt>
            <dd className={bench > 0.2 ? 'pending' : 'ok'}>{bench > 0.02 ? t('p9.safety.spill', { g: bench.toFixed(2).replace('.', ',') }) : `● ${t('p9.safety.dry')}`}</dd>
          </dl>
          <div className="row">
            {w.flame.ignited && <button className="btn small" onClick={() => dispatch({ type: 'setIgnition', on: false })}>⏻ {t('p9.act.extinguish')}</button>}
            {!w.hood.fanOn && <button className="btn small ghost" onClick={() => dispatch({ type: 'setHoodFan', on: true })}>🌀 {t('p9.act.fanOn')}</button>}
            {!sash && <button className="btn small ghost" onClick={() => dispatch({ type: 'setSash', heightCm: w.params.sashMaxCm - 5 })}>▼ {t('p9.act.sashDown')}</button>}
            {bench > 0.02 && <button className="btn small" onClick={() => dispatch({ type: 'cleanSpill' })}>🧻 {t('p9.safety.cleanBench')}</button>}
          </div>
        </>
      )}
    </aside>
  );
}

/** Bloqueos: detienen el gesto riesgoso, explican el riesgo y ofrecen la recuperación; nunca un modal. */
export function SafetyBanner09() {
  const { t } = useTranslation();
  useP09((s) => s.version);
  const rt = useP09((s) => s.runtime);
  const dispatch = useP09((s) => s.dispatch);
  const toast = useP09((s) => s.toast);
  if (!rt) return null;
  const w = rt.world;
  const ack = () => {
    const r = dispatch({ type: 'acknowledge' });
    if (!r.ok && r.code) toast('warn', t(`p9.block.ack_${r.code}`));
  };
  if (w.safety.stoppedByTeacher) {
    return (
      <div className="safety-banner" role="alertdialog">
        <strong>⏹ {t('p3.block.teacherTitle')}</strong>
        <span>{t('p3.block.teacher')}</span>
        <button className="btn" onClick={() => dispatch({ type: 'teacherStop', on: false })}>{t('p3.block.teacherResume')}</button>
      </div>
    );
  }
  const code = w.safety.block?.code;
  if (!code) return null;
  return (
    <div className="safety-banner" role="alert">
      <strong>⛔ {t(`p9.block.title_${code}`)}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>{t(`p9.block.${code}`)}</span>
      {code === 'IGNITION' && !w.hood.fanOn && <button className="btn" onClick={() => dispatch({ type: 'setHoodFan', on: true })}>🌀 {t('p9.act.fanOn')}</button>}
      {code === 'IGNITION' && !sashOK(w) && <button className="btn" onClick={() => dispatch({ type: 'setSash', heightCm: w.params.sashMaxCm - 5 })}>▼ {t('p9.act.sashDown')}</button>}
      <button className="btn" onClick={ack}>{t('p3.block.reset')}</button>
    </div>
  );
}
