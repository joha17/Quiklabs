import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP4 } from './store';
import { describeFlame } from '../p3/describe';
import { ethanolNearBurner, mgSetupMissing } from '../../simulation/reaction-world/world';

/**
 * HUD de seguridad (§18): estado del mechero (modelo de la Práctica 3), detector de CO/gas, ventilación,
 * guantes, requisitos para quemar Mg y distancia del etanol a la llama. Acciones de emergencia siempre disponibles.
 */
export function SafetyPanel4() {
  const { t } = useTranslation();
  useP4((s) => s.version);
  const rt = useP4((s) => s.runtime);
  const dispatch = useP4((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const g = w.gas;
  const r = g.room;
  const p = g.params;
  const lel = Math.min(99, (r.gasAccumMl / p.gasBlockMl) * 25);
  const coLevel = r.coPpm > p.coAlarmPpm ? 'bad' : r.coPpm > p.coWarnPpm ? 'pending' : 'ok';
  const gasLevel = r.gasAccumMl > p.gasAlarmMl ? 'bad' : r.gasAccumMl > p.gasWarnMl ? 'pending' : 'ok';
  const sym = (l: string) => (l === 'bad' ? '▲▲' : l === 'pending' ? '▲' : '●');
  const mgMissing = mgSetupMissing(w, rt.ctx);
  const ethanol = ethanolNearBurner(w, rt.ctx);
  return (
    <aside className="p3-safety" aria-label={t('p4.safety.title')}>
      <div className="p3-safety-head">
        <strong>🛡 {t('p4.safety.title')}</strong>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      <div className="p3-flame-line" aria-live="polite">{describeFlame(g)}</div>
      {open && (
        <>
          <dl className="p3-meters">
            <dt>{t('p3.safety.co')}</dt>
            <dd className={coLevel}><span aria-hidden="true">{sym(coLevel)} </span>{Math.round(r.coPpm)} ppm</dd>
            <dt>{t('p3.safety.gas')}</dt>
            <dd className={gasLevel}><span aria-hidden="true">{sym(gasLevel)} </span>{lel.toFixed(0)} % LIE</dd>
            <dt>{t('p3.safety.vent')}</dt>
            <dd className={r.extractionOn ? 'ok' : 'pending'}>{r.extractionOn ? t('p3.safety.extractionOn') : t('p3.safety.extractionOff')}</dd>
            <dt>{t('p4.safety.ethanol')}</dt>
            <dd className={ethanol ? 'bad' : 'ok'}>{ethanol ? `▲▲ ${t('p4.safety.ethanolNear')}` : `● ${t('p4.safety.ethanolFar')}`}</dd>
            <dt>{t('p4.safety.mg')}</dt>
            <dd className={mgMissing.length ? 'pending' : 'ok'}>{mgMissing.length ? `▲ ${t('p4.safety.mgPending', { n: mgMissing.length })}` : `● ${t('p4.safety.mgReady')}`}</dd>
            <dt>{t('p4.safety.gloves')}</dt>
            <dd className={w.safety.gloves ? 'ok' : 'pending'}>{w.safety.gloves ? t('p4.safety.glovesOn') : t('p4.safety.glovesOff')}</dd>
          </dl>
          <div className="row">
            <button className="btn small danger" onClick={() => dispatch({ type: 'gas', cmd: { type: 'emergencyShutoff' } })}>⛔ {t('p3.safety.shutoff')}</button>
            <button className="btn small" aria-pressed={r.extractionOn} onClick={() => dispatch({ type: 'gas', cmd: { type: 'setExtraction', on: !r.extractionOn } })}>🌀 {t('p3.safety.extraction')}</button>
            <button className="btn small" aria-pressed={w.safety.gloves} onClick={() => dispatch({ type: 'setGloves', on: !w.safety.gloves })}>🧤 {w.safety.gloves ? t('p4.safety.glovesRemove') : t('p4.safety.glovesPut')}</button>
          </div>
        </>
      )}
    </aside>
  );
}

/** Bloqueos e incidentes: detienen la acción, explican el riesgo y ofrecen la recuperación (§18.3). */
export function SafetyBanner4() {
  const { t } = useTranslation();
  useP4((s) => s.version);
  const rt = useP4((s) => s.runtime);
  const dispatch = useP4((s) => s.dispatch);
  const toast = useP4((s) => s.toast);
  const setModal = useP4((s) => s.setModal);
  if (!rt) return null;
  const w = rt.world;
  const ack = () => {
    const r = dispatch({ type: 'acknowledge' });
    if (!r.ok && r.code) toast('warn', t(`p4.block.ack_${r.code}`) !== `p4.block.ack_${r.code}` ? t(`p4.block.ack_${r.code}`) : t(`p3.block.ack_${r.code}`));
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
  const inc = w.safety.incident ?? null;
  if (inc) {
    const step = (k: string) => (inc.done.includes(k) ? '✓' : '○');
    return (
      <div className="safety-banner" role="alertdialog" aria-labelledby="p4-incident">
        <strong id="p4-incident">⛔ {t(`p4.block.inc_${inc.code}`)}</strong>
        <span style={{ flex: 1, minWidth: '14rem' }}>{t(`p4.block.incHelp_${inc.code}`)}</span>
        {inc.needs.includes('FIRST_AID') && <button className="btn" onClick={() => dispatch({ type: 'firstAid' })}>{step('FIRST_AID')} {t('p3.act.firstAid')}</button>}
        {inc.needs.includes('CLEAN_SPILL') && <span className="hint">{step('CLEAN_SPILL')} {t('p4.block.cleanSpill')}</span>}
        <button className="btn" onClick={ack}>{t('p3.block.resolve')}</button>
      </div>
    );
  }
  // El mechero (sub-mundo de la Práctica 3) tiene sus propios incidentes y bloqueos.
  const ginc = w.gas.safety.incident;
  if (ginc) {
    const step = (k: string) => (ginc.done.includes(k) ? '✓' : '○');
    return (
      <div className="safety-banner" role="alertdialog">
        <strong>⛔ {t(`p3.block.inc_${ginc.code}`)}</strong>
        <span style={{ flex: 1, minWidth: '14rem' }}>{t(`p3.block.incHelp_${ginc.code}`)}</span>
        {ginc.needs.includes('SHUTOFF') && <button className="btn" onClick={() => dispatch({ type: 'gas', cmd: { type: 'emergencyShutoff' } })}>{step('SHUTOFF')} {t('p3.safety.shutoff')}</button>}
        {ginc.needs.includes('EXTINGUISHER') && <button className="btn" onClick={() => dispatch({ type: 'gas', cmd: { type: 'useExtinguisher' } })}>{step('EXTINGUISHER')} {t('p3.act.extinguisher')}</button>}
        {ginc.needs.includes('FIRST_AID') && <button className="btn" onClick={() => dispatch({ type: 'gas', cmd: { type: 'firstAid' } })}>{step('FIRST_AID')} {t('p3.act.firstAid')}</button>}
        <button className="btn" onClick={() => dispatch({ type: 'gas', cmd: { type: 'acknowledge' } })}>{t('p3.block.resolve')}</button>
      </div>
    );
  }
  const b = w.safety.block ?? (w.gas.safety.block ? { code: w.gas.safety.block.code, since: w.gas.safety.block.since, reasons: undefined } : null);
  if (!b) return null;
  const own = t(`p4.block.${b.code}`) !== `p4.block.${b.code}`;
  return (
    <div className="safety-banner" role="alert">
      <strong>⛔ {t('block.title')}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>
        {own ? t(`p4.block.${b.code}`, { missing: (b.reasons ?? mgSetupMissing(w, rt.ctx)).map((m) => t(`p4.mgSetup.${m}`)).join(', ') }) : t(`p3.block.${b.code}`)}
      </span>
      {b.code === 'MG_SETUP' && !w.safety.mgWarningAccepted && <button className="btn" onClick={() => setModal({ kind: 'mgWarning' })}>{t('p4.block.readWarning')}</button>}
      {(w.gas.burner.tableGasValve > 0.02 || w.gas.burner.needleGasValve > 0.02) && ['GAS_ACCUMULATION', 'LEAK_FLAME_TEST', 'CO_HIGH', 'ETHANOL_NEAR_FLAME'].includes(b.code) && (
        <button className="btn" onClick={() => { dispatch({ type: 'gas', cmd: { type: 'setValve', valve: 'NEEDLE', value: 0 } }); dispatch({ type: 'gas', cmd: { type: 'setValve', valve: 'TABLE', value: 0 } }); }}>{t('p3.block.closeGas')}</button>
      )}
      <button className="btn" onClick={ack}>{t('p3.block.reset')}</button>
    </div>
  );
}
