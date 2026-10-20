import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP01 } from './store';

/**
 * HUD de seguridad de la Práctica 1 (§11): pera (nunca aspirar con la boca), vidrio dañado, derrames en la mesada y
 * en el platillo, rebalse de la probeta; acciones de limpieza a la mano.
 */
export function SafetyPanel01() {
  const { t } = useTranslation();
  useP01((s) => s.version);
  const rt = useP01((s) => s.runtime);
  const dispatch = useP01((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const bench = w.fluids.benchSpill.waterG;
  const tray = w.fluids.spillTray01.waterG;
  return (
    <aside className="p3-safety" aria-label={t('p01.safety.title')}>
      <div className="p3-safety-head">
        <strong>🛡 {t('p01.safety.title')}</strong>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      {open && (
        <>
          <dl className="p3-meters">
            <dt>{t('p01.safety.filler')}</dt>
            <dd className={w.pipette.fillerContaminated ? 'bad' : w.pipette.fillerAttached ? 'ok' : 'pending'}>
              {w.pipette.fillerContaminated ? `▲ ${t('p01.safety.fillerDirty')}` : w.pipette.fillerAttached ? `● ${t('p01.safety.fillerOn')}` : t('p01.safety.fillerOff')}
            </dd>
            <dt>{t('p01.safety.bench')}</dt>
            <dd className={bench > 0.5 ? 'pending' : 'ok'}>{bench > 0.05 ? t('p01.safety.spill', { ml: (bench / 0.997).toFixed(1).replace('.', ',') }) : `● ${t('p01.safety.dry')}`}</dd>
            <dt>{t('p01.safety.pan')}</dt>
            <dd className={w.balance.panWetG > 0.005 ? 'bad' : 'ok'}>{w.balance.panWetG > 0.005 ? `▲ ${t('p01.safety.panWet')}` : `● ${t('p01.safety.dry')}`}</dd>
            <dt>{t('p01.safety.tray')}</dt>
            <dd className={tray > 0.05 ? 'pending' : 'ok'}>{tray > 0.05 ? t('p01.safety.trayWater') : `● ${t('p01.safety.dry')}`}</dd>
          </dl>
          <div className="row">
            {bench > 0.05 && <button className="btn small" onClick={() => dispatch({ type: 'cleanSpill', where: 'bench' })}>🧻 {t('p01.safety.cleanBench')}</button>}
            {w.balance.panWetG > 0.005 && <button className="btn small danger" onClick={() => dispatch({ type: 'cleanSpill', where: 'pan' })}>🧻 {t('p01.safety.cleanPan')}</button>}
            {tray > 0.05 && <button className="btn small ghost" onClick={() => dispatch({ type: 'cleanSpill', where: 'tray' })}>{t('p01.safety.emptyTray')}</button>}
            {w.pipette.fillerContaminated && <button className="btn small danger" onClick={() => dispatch({ type: 'cleanObject', objectId: 'pipetteFiller', action: 'clean' })}>🧽 {t('p01.safety.cleanFiller')}</button>}
          </div>
        </>
      )}
    </aside>
  );
}

/** Bloqueos e incidentes: detienen la acción, explican el riesgo y ofrecen la recuperación; nunca un modal (§11). */
export function SafetyBanner01() {
  const { t } = useTranslation();
  useP01((s) => s.version);
  const rt = useP01((s) => s.runtime);
  const dispatch = useP01((s) => s.dispatch);
  const toast = useP01((s) => s.toast);
  if (!rt) return null;
  const w = rt.world;
  const ack = () => {
    const r = dispatch({ type: 'acknowledge' });
    if (!r.ok && r.code) toast('warn', t(`p01.block.ack_${r.code}`));
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
  const b = w.safety.block;
  const code = inc?.code ?? b?.code;
  if (!code) return null;
  return (
    <div className="safety-banner" role="alert">
      <strong>⛔ {t(`p01.block.title_${code}`)}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>{t(`p01.block.${code}`)}</span>
      {code === 'FILLER' && w.pipette.fillerContaminated && <button className="btn" onClick={() => dispatch({ type: 'cleanObject', objectId: 'pipetteFiller', action: 'clean' })}>🧽 {t('p01.safety.cleanFiller')}</button>}
      {code === 'PAN_WET' && w.balance.panWetG > 0.005 && <button className="btn" onClick={() => dispatch({ type: 'cleanSpill', where: 'pan' })}>🧻 {t('p01.safety.cleanPan')}</button>}
      <button className="btn" onClick={ack}>{t('p3.block.reset')}</button>
    </div>
  );
}
