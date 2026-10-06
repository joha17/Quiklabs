import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP5 } from './store';
import { describeFlame } from '../p3/describe';
import { heatingBlockers, tubeTempC } from '../../simulation/stoich-world/world';
import { tempWords5 } from './describe';

/**
 * HUD de seguridad de la Práctica 5: llama (modelo de la Práctica 3), CO/gas, ventilación, pantalla, montaje
 * (boca, tapón, nuez), mezcla sin contaminantes y temperatura del tubo. Acciones de emergencia siempre disponibles.
 */
export function SafetyPanel5() {
  const { t } = useTranslation();
  useP5((s) => s.version);
  const rt = useP5((s) => s.runtime);
  const dispatch = useP5((s) => s.dispatch);
  const mode = useP5((s) => s.settings.mode);
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
  const blockers = heatingBlockers(w, rt.ctx);
  const T = tubeTempC(w.tube);
  const hot = T > w.params.ambientC + w.params.allowedDeltaC;
  return (
    <aside className="p3-safety" aria-label={t('p5.safety.title')}>
      <div className="p3-safety-head">
        <strong>🛡 {t('p5.safety.title')}</strong>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      <div className="p3-flame-line" aria-live="polite">{describeFlame(g)}</div>
      {open && (
        <>
          <dl className="p3-meters">
            <dt>{t('p5.safety.tube')}</dt>
            <dd className={T > 200 ? 'bad' : hot ? 'pending' : 'ok'}>{tempWords5(T)}{mode !== 'EVALUATION' && T > 30 ? ` · ${Math.round(T)} °C` : ''}</dd>
            <dt>{t('p5.safety.setup')}</dt>
            <dd className={blockers.length ? 'pending' : 'ok'}>{blockers.length ? `▲ ${blockers.map((b) => t(`p5.blocker.${b}`)).join(', ')}` : `● ${t('p5.safety.setupOk')}`}</dd>
            <dt>{t('p3.safety.co')}</dt>
            <dd className={coLevel}><span aria-hidden="true">{sym(coLevel)} </span>{Math.round(r.coPpm)} ppm</dd>
            <dt>{t('p3.safety.gas')}</dt>
            <dd className={gasLevel}><span aria-hidden="true">{sym(gasLevel)} </span>{lel.toFixed(0)} % LIE</dd>
            <dt>{t('p3.safety.vent')}</dt>
            <dd className={r.extractionOn ? 'ok' : 'pending'}>{r.extractionOn ? t('p3.safety.extractionOn') : t('p3.safety.extractionOff')}</dd>
          </dl>
          <div className="row">
            <button className="btn small danger" onClick={() => dispatch({ type: 'gas', cmd: { type: 'emergencyShutoff' } })}>⛔ {t('p3.safety.shutoff')}</button>
            <button className="btn small" aria-pressed={r.extractionOn} onClick={() => dispatch({ type: 'gas', cmd: { type: 'setExtraction', on: !r.extractionOn } })}>🌀 {t('p3.safety.extraction')}</button>
          </div>
        </>
      )}
    </aside>
  );
}

/** Bloqueos e incidentes: detienen la acción, explican el riesgo y ofrecen la recuperación (§19.5). */
export function SafetyBanner5() {
  const { t } = useTranslation();
  useP5((s) => s.version);
  const rt = useP5((s) => s.runtime);
  const dispatch = useP5((s) => s.dispatch);
  const toast = useP5((s) => s.toast);
  if (!rt) return null;
  const w = rt.world;
  const ack = () => {
    const r = dispatch({ type: 'acknowledge' });
    if (!r.ok && r.code) toast('warn', t(`p5.block.ack_${r.code}`) !== `p5.block.ack_${r.code}` ? t(`p5.block.ack_${r.code}`) : t(`p3.block.ack_${r.code}`));
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
  const own = t(`p5.block.${b.code}`) !== `p5.block.${b.code}`;
  return (
    <div className="safety-banner" role="alert">
      <strong>⛔ {t('block.title')}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>{own ? t(`p5.block.${b.code}`) : t(`p3.block.${b.code}`)}</span>
      {(w.gas.burner.tableGasValve > 0.02 || w.gas.burner.needleGasValve > 0.02) && (
        <button className="btn" onClick={() => { dispatch({ type: 'gas', cmd: { type: 'setValve', valve: 'NEEDLE', value: 0 } }); dispatch({ type: 'gas', cmd: { type: 'setValve', valve: 'TABLE', value: 0 } }); }}>{t('p3.block.closeGas')}</button>
      )}
      <button className="btn" onClick={ack}>{t('p3.block.reset')}</button>
    </div>
  );
}
