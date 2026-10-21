import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP08 } from './store';
import { SPECIES, massG, speciesIn } from '../../simulation/organic-chemistry/species';
import { pressureKPa } from '../../simulation/organic-world/world';
import type { P08World } from '../../simulation/organic-world/types';

/** Frascos de inflamables abiertos (metanol, alcohol isoamílico, ácido acético). */
const openFlammables = (w: P08World) => Object.values(w.vessels).filter((v) => v.id.startsWith('bt') && v.capped === false && speciesIn(v.liq, 1e-6).some((k) => SPECIES[k].flammable)).map((v) => v.id);

/**
 * HUD de seguridad de la Práctica 8 (§11): EPP, inflamables abiertos, calefacción sin llama, balón caliente y pinza,
 * presión del embudo, derrames y residuos; las acciones de recuperación a la mano. Siempre visible, en todos los modos.
 */
export function SafetyPanel08() {
  const { t } = useTranslation();
  useP08((s) => s.version);
  const rt = useP08((s) => s.runtime);
  const dispatch = useP08((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const bench = massG(w.outside.bench);
  const flam = openFlammables(w);
  const hot = (w.vessels.rf?.tempC ?? 25) > 45;
  const kPa = pressureKPa(w);
  return (
    <aside className="p3-safety" aria-label={t('p8.safety.title')}>
      <div className="p3-safety-head">
        <strong>🛡 {t('p8.safety.title')}</strong>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      {open && (
        <>
          <dl className="p3-meters">
            <dt>{t('p8.safety.ppe')}</dt>
            <dd className={w.ppe ? 'ok' : 'pending'}>{w.ppe ? `● ${t('p8.safety.ppeOk')}` : `▲ ${t('p8.safety.ppeMissing')}`}</dd>
            <dt>{t('p8.safety.flammables')}</dt>
            <dd className={flam.length ? 'pending' : 'ok'}>{flam.length ? `▲ ${t('p8.safety.open', { n: flam.length })}` : `● ${t('p8.safety.capped')}`}</dd>
            <dt>{t('p8.safety.flask')}</dt>
            <dd className={hot ? 'pending' : 'ok'}>{hot ? `▲ ${t('p8.safety.hot')}${w.tongs ? ` · ${t('p8.safety.tongsOn')}` : ''}` : `● ${t('p8.safety.cool')}`}</dd>
            {w.vessels.sf && <dt>{t('p8.safety.funnel')}</dt>}
            {w.vessels.sf && <dd className={kPa > w.params.funnelVentKPa ? 'bad' : 'ok'}>{kPa > 1 ? t('p8.safety.pressure', { p: Math.round(kPa) }) : `● ${t('p8.safety.vented')}`}</dd>}
            <dt>{t('p8.safety.bench')}</dt>
            <dd className={bench > 0.2 ? 'pending' : 'ok'}>{bench > 0.02 ? t('p8.safety.spill', { g: bench.toFixed(2).replace('.', ',') }) : `● ${t('p8.safety.dry')}`}</dd>
          </dl>
          <div className="row">
            <button className="btn small ghost" aria-pressed={w.tongs} onClick={() => dispatch({ type: 'useTongs', on: !w.tongs })}>🦞 {t(w.tongs ? 'p8.safety.tongsRelease' : 'p8.safety.tongsTake')}</button>
            {bench > 0.02 && <button className="btn small" onClick={() => dispatch({ type: 'cleanSpill' })}>🧻 {t('p8.safety.cleanBench')}</button>}
            {flam.map((id) => <button key={id} className="btn small ghost" onClick={() => dispatch({ type: 'setCap', vesselId: id, capped: true })}>{t('p8.safety.capOne', { o: t(`p8.obj.${id}`) })}</button>)}
          </div>
        </>
      )}
    </aside>
  );
}

/** Bloqueos: detienen el gesto riesgoso, explican el riesgo y ofrecen la recuperación; nunca un modal (§11.2). */
export function SafetyBanner08() {
  const { t } = useTranslation();
  useP08((s) => s.version);
  const rt = useP08((s) => s.runtime);
  const dispatch = useP08((s) => s.dispatch);
  const toast = useP08((s) => s.toast);
  if (!rt) return null;
  const w = rt.world;
  const ack = () => {
    const r = dispatch({ type: 'acknowledge' });
    if (!r.ok && r.code) toast('warn', t(`p8.block.ack_${r.code}`));
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
      <strong>⛔ {t(`p8.block.title_${code}`)}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>{t(`p8.block.${code}`)}</span>
      {code === 'PRESSURE' && <button className="btn" onClick={() => dispatch({ type: 'vent' })}>💨 {t('p8.act.vent')}</button>}
      {code === 'FLAME' && openFlammables(w).map((id) => <button key={id} className="btn" onClick={() => dispatch({ type: 'setCap', vesselId: id, capped: true })}>{t('p8.safety.capOne', { o: t(`p8.obj.${id}`) })}</button>)}
      <button className="btn" onClick={ack}>{t('p3.block.reset')}</button>
    </div>
  );
}
