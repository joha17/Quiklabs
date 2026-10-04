import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP3 } from './store';
import { describeFlame } from './describe';

/**
 * HUD de seguridad (§4.1, §15): detector virtual de CO y gas combustible, ventilación, estado de la llama narrado
 * y acciones de emergencia siempre disponibles. El CO se muestra como medida y alarma, nunca como humo.
 */
export function SafetyPanel3() {
  const { t } = useTranslation();
  useP3((s) => s.version);
  const rt = useP3((s) => s.runtime);
  const dispatch = useP3((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const r = w.room;
  const p = w.params;
  const lel = Math.min(99, (r.gasAccumMl / p.gasBlockMl) * 25);
  const coLevel = r.coPpm > p.coAlarmPpm ? 'bad' : r.coPpm > p.coWarnPpm ? 'pending' : 'ok';
  const gasLevel = r.gasAccumMl > p.gasAlarmMl ? 'bad' : r.gasAccumMl > p.gasWarnMl ? 'pending' : 'ok';
  const sym = (l: string) => (l === 'bad' ? '▲▲' : l === 'pending' ? '▲' : '●');
  return (
    <aside className="p3-safety" aria-label={t('p3.safety.title')}>
      <div className="p3-safety-head">
        <strong>🛡 {t('p3.safety.title')}</strong>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      <div className="p3-flame-line" aria-live="polite">{describeFlame(w)}</div>
      {open && (
        <>
          <dl className="p3-meters">
            <dt>{t('p3.safety.co')}</dt>
            <dd className={coLevel}><span aria-hidden="true">{sym(coLevel)} </span>{Math.round(r.coPpm)} ppm</dd>
            <dt>{t('p3.safety.gas')}</dt>
            <dd className={gasLevel}><span aria-hidden="true">{sym(gasLevel)} </span>{lel.toFixed(0)} % LIE</dd>
            <dt>{t('p3.safety.vent')}</dt>
            <dd className={r.extractionOn ? 'ok' : 'pending'}>{r.extractionOn ? t('p3.safety.extractionOn') : t('p3.safety.extractionOff')}</dd>
            <dt>{t('p3.safety.supply')}</dt>
            <dd className={w.burner.supplyOn ? 'ok' : 'bad'}>{w.burner.supplyOn ? t('p3.safety.supplyOn') : t('p3.safety.supplyOff')}</dd>
          </dl>
          <div className="row">
            <button className="btn small danger" onClick={() => dispatch({ type: 'emergencyShutoff' })}>⛔ {t('p3.safety.shutoff')}</button>
            <button className="btn small" aria-pressed={r.extractionOn} onClick={() => dispatch({ type: 'setExtraction', on: !r.extractionOn })}>🌀 {t('p3.safety.extraction')}</button>
            <button className="btn small" onClick={() => dispatch({ type: 'raiseAlarm' })}>📢 {t('p3.safety.alarm')}</button>
          </div>
          <p className="hint" style={{ margin: 0 }}>{t('p3.safety.note')}</p>
        </>
      )}
    </aside>
  );
}

/** Bloqueos e incidentes: detienen la acción, explican el riesgo y ofrecen la recuperación (§14, §15.4). */
export function SafetyBanner3() {
  const { t } = useTranslation();
  useP3((s) => s.version);
  const rt = useP3((s) => s.runtime);
  const dispatch = useP3((s) => s.dispatch);
  const toast = useP3((s) => s.toast);
  if (!rt) return null;
  const w = rt.world;
  const ack = () => {
    const r = dispatch({ type: 'acknowledge' });
    if (!r.ok && r.code) toast('warn', t(`p3.block.ack_${r.code}`));
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
  const inc = w.safety.incident;
  if (inc) {
    const step = (k: string) => (inc.done.includes(k) ? '✓' : '○');
    return (
      <div className="safety-banner" role="alertdialog" aria-labelledby="p3-incident">
        <strong id="p3-incident">⛔ {t(`p3.block.inc_${inc.code}`)}</strong>
        <span style={{ flex: 1, minWidth: '14rem' }}>{t(`p3.block.incHelp_${inc.code}`)}</span>
        {inc.needs.includes('SHUTOFF') && <button className="btn" onClick={() => dispatch({ type: 'emergencyShutoff' })}>{step('SHUTOFF')} {t('p3.safety.shutoff')}</button>}
        {inc.needs.includes('EXTINGUISHER') && <button className="btn" onClick={() => dispatch({ type: 'useExtinguisher' })}>{step('EXTINGUISHER')} {t('p3.act.extinguisher')}</button>}
        {inc.needs.includes('BLANKET') && <button className="btn" onClick={() => dispatch({ type: 'useBlanket' })}>{step('BLANKET')} {t('p3.act.blanket')}</button>}
        {inc.needs.includes('FIRST_AID') && <button className="btn" onClick={() => dispatch({ type: 'firstAid' })}>{step('FIRST_AID')} {t('p3.act.firstAid')}</button>}
        <button className="btn" onClick={ack}>{t('p3.block.resolve')}</button>
      </div>
    );
  }
  const b = w.safety.block;
  if (!b) return null;
  return (
    <div className="safety-banner" role="alert">
      <strong>⛔ {t('block.title')}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>{t(`p3.block.${b.code}`)}</span>
      {(w.burner.tableGasValve > 0.02 || w.burner.needleGasValve > 0.02) && (
        <button className="btn" onClick={() => { dispatch({ type: 'setValve', valve: 'NEEDLE', value: 0 }); dispatch({ type: 'setValve', valve: 'TABLE', value: 0 }); }}>{t('p3.block.closeGas')}</button>
      )}
      {!w.room.extractionOn && <button className="btn" onClick={() => dispatch({ type: 'setExtraction', on: true })}>{t('p3.block.ventilate')}</button>}
      <button className="btn" onClick={ack}>{t('p3.block.reset')}</button>
    </div>
  );
}
