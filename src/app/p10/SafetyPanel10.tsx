import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP10 } from './store';
import { SENSOR_PROFILES, sensorReading } from '../../simulation/instruments/pressure-sensor';

/**
 * HUD de seguridad de la Práctica 10 (§27): presión del reactor (nunca obstruir un sistema que genera gas), uniones
 * de gas, bureta sujeta, sensor de presión (rango, sobrecarga, sin líquido) y acciones para aliviar o detener.
 */
export function SafetyPanel10() {
  const { t } = useTranslation();
  useP10((s) => s.version);
  const rt = useP10((s) => s.runtime);
  const dispatch = useP10((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const r = w.reactor;
  const dp = r.stoppered ? r.pressureKPa - w.params.pressureKPa : 0;
  const conns = Object.values(w.connections);
  const loose = conns.filter((c) => c.connectedTo && !c.secured).length;
  const missing = conns.filter((c) => !c.connectedTo).length;
  const kink = conns.some((c) => c.kinkFraction > 0.4);
  const prof = SENSOR_PROFILES[w.sensor.model];
  const rd = sensorReading(w.sensor);
  return (
    <aside className="p3-safety" aria-label={t('p10.safety.title')}>
      <div className="p3-safety-head">
        <strong>🛡 {t('p10.safety.title')}</strong>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      <div className="p3-flame-line" aria-live="polite">{t(`p10.reactor.${r.stage}`)}{r.stoppered ? ` · ${t('p10.safety.sealed')}` : ''}</div>
      {open && (
        <>
          <dl className="p3-meters">
            <dt>{t('p10.safety.reactorP')}</dt>
            <dd className={dp > 8 ? 'bad' : dp > 2 ? 'pending' : 'ok'}>{dp > 8 ? `▲ ${t('p10.safety.pHigh')}` : dp > 2 ? t('p10.safety.pSome') : `● ${t('p10.safety.pOk')}`}</dd>
            <dt>{t('p10.safety.lines')}</dt>
            <dd className={missing || loose || kink ? 'pending' : 'ok'}>
              {missing ? t('p10.safety.missing', { n: missing }) : loose ? t('p10.safety.loose', { n: loose }) : kink ? t('p10.safety.kinked') : `● ${t('p10.safety.linesOk')}`}
            </dd>
            <dt>{t('p10.safety.burette')}</dt>
            <dd className={w.burette.inverted && !w.burette.clamped ? 'bad' : 'ok'}>{w.burette.inverted ? (w.burette.clamped ? t('p10.safety.clamped') : `▲ ${t('p10.safety.unclamped')}`) : t('p10.safety.notMounted')}</dd>
            <dt>{t('p10.safety.sensor')}</dt>
            <dd className={w.sensor.overload || w.sensor.liquidIngress > 0 ? 'bad' : 'ok'}>
              {t(`p10.sensorKind.${prof.kind}`)} · {prof.rangeKPa[0]}–{prof.rangeKPa[1]} kPa{w.sensor.overload ? ` · ▲ ${t('p10.safety.overload')}` : ''}{!Number.isFinite(rd) ? ` · ${t('p10.safety.cannotRead')}` : ''}
            </dd>
          </dl>
          <div className="row">
            {r.stoppered && <button className="btn small danger" onClick={() => dispatch({ type: 'insertStopper', on: false })}>⛔ {t('p10.safety.release')}</button>}
            {w.syringe.held && <button className="btn small" onClick={() => dispatch({ type: 'setPlunger', targetMl: w.syringe.markMl, held: false })}>✋ {t('p10.safety.releasePlunger')}</button>}
          </div>
        </>
      )}
    </aside>
  );
}

/** Bloqueos e incidentes: detienen la acción, explican el riesgo y ofrecen la recuperación (§27.5). */
export function SafetyBanner10() {
  const { t } = useTranslation();
  useP10((s) => s.version);
  const rt = useP10((s) => s.runtime);
  const dispatch = useP10((s) => s.dispatch);
  const toast = useP10((s) => s.toast);
  if (!rt) return null;
  const w = rt.world;
  const ack = () => {
    const r = dispatch({ type: 'acknowledge' });
    if (!r.ok && r.code) toast('warn', t(`p10.block.ack_${r.code}`));
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
  const b = w.safety.block;
  if (!b) return null;
  return (
    <div className="safety-banner" role="alert">
      <strong>⛔ {t('block.title')}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>{t(`p10.block.${b.code}`)}</span>
      <button className="btn" onClick={ack}>{t('p3.block.reset')}</button>
    </div>
  );
}
