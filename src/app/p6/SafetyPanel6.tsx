import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP6 } from './store';
import { tubeTempC } from '../../simulation/calorimetry-world/world';
import { bombInterlocks } from '../../simulation/calorimetry-world/bomb';
import { tempWords6 } from './describe';

/**
 * HUD de seguridad de la Práctica 6 (§22): plantilla y baño, objetos calientes (nunca solo por color), bomba
 * calorimétrica (perfil, presión, enclavamientos) y acciones de parada siempre disponibles.
 */
export function SafetyPanel6() {
  const { t } = useTranslation();
  useP6((s) => s.version);
  const rt = useP6((s) => s.runtime);
  const dispatch = useP6((s) => s.dispatch);
  const mode = useP6((s) => s.settings.mode);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const amb = w.params.ambientC;
  const hot = Object.values(w.tubes).filter((tb) => tubeTempC(tb) > amb + 30).map((tb) => tb.id);
  const plateHot = w.plate.plateC > 60;
  const locks = w.params.bombEnabled && w.bomb.profile ? bombInterlocks(w) : [];
  return (
    <aside className="p3-safety" aria-label={t('p6.safety.title')}>
      <div className="p3-safety-head">
        <strong>🛡 {t('p6.safety.title')}</strong>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      <div className="p3-flame-line" aria-live="polite">
        {w.plate.knob > 0.01 ? t('p6.safety.plateOn', { k: (w.plate.knob * 5).toFixed(1).replace('.', ',') }) : plateHot ? t('p6.safety.plateHotOff') : t('p6.safety.plateOff')}
      </div>
      {open && (
        <>
          <dl className="p3-meters">
            <dt>{t('p6.safety.bath')}</dt>
            <dd className={w.bath.vigor > 0.6 ? 'bad' : w.vessels.beaker.waterC > 60 ? 'pending' : 'ok'}>
              {tempWords6(w.vessels.beaker.waterC, amb)}{mode !== 'EVALUATION' && w.vessels.beaker.waterG > 0 ? ` · ${Math.round(w.vessels.beaker.waterG)} g` : ''}{w.bath.vigor > 0.6 ? ` · ${t('p6.safety.vigorous')}` : ''}
            </dd>
            <dt>{t('p6.safety.hot')}</dt>
            <dd className={hot.length || plateHot ? 'bad' : 'ok'}>{hot.length || plateHot ? `▲ ${[...hot.map((id) => t(`p6.tag.${id}`, { code: w.params.unknownCode })), ...(plateHot ? [t('p6.tag.hotplate')] : [])].join(', ')}` : `● ${t('p6.safety.noneHot')}`}</dd>
            {w.params.bombEnabled && (
              <>
                <dt>{t('p6.safety.bomb')}</dt>
                <dd className={w.bomb.pressureAtm > 0 ? 'pending' : 'ok'}>{t(`p6.bombStage.${w.bomb.stage}`)} · {w.bomb.pressureAtm.toFixed(0)} atm{locks.length && w.bomb.stage !== 'UNASSEMBLED' ? ` · ${t('p6.safety.locks', { n: locks.length })}` : ''}</dd>
              </>
            )}
          </dl>
          <div className="row">
            <button className="btn small danger" onClick={() => dispatch({ type: 'setPlate', knob: 0 })}>⛔ {t('p6.safety.plateOffBtn')}</button>
            {w.params.bombEnabled && w.bomb.profile && <button className="btn small" onClick={() => dispatch({ type: 'bomb', cmd: { type: 'abort' } })}>⏹ {t('p6.safety.bombAbort')}</button>}
          </div>
        </>
      )}
    </aside>
  );
}

/** Bloqueos e incidentes: detienen la acción, explican el riesgo y ofrecen la recuperación (§22.4). */
export function SafetyBanner6() {
  const { t } = useTranslation();
  useP6((s) => s.version);
  const rt = useP6((s) => s.runtime);
  const dispatch = useP6((s) => s.dispatch);
  const toast = useP6((s) => s.toast);
  if (!rt) return null;
  const w = rt.world;
  const ack = () => {
    const r = dispatch({ type: 'acknowledge' });
    if (!r.ok && r.code) toast('warn', t(`p6.block.ack_${r.code}`));
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
    return (
      <div className="safety-banner" role="alertdialog">
        <strong>⛔ {t(`p6.block.inc_${inc.code}`)}</strong>
        <span style={{ flex: 1, minWidth: '14rem' }}>{t(`p6.block.incHelp_${inc.code}`)}</span>
        <button className="btn" onClick={ack}>{t('p3.act.firstAid')}</button>
      </div>
    );
  }
  const b = w.safety.block;
  if (!b) return null;
  return (
    <div className="safety-banner" role="alert">
      <strong>⛔ {t('block.title')}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>{t(`p6.block.${b.code}`)}</span>
      {b.code === 'OPEN_PRESSURIZED' && w.bomb.pressureAtm > 0 && <button className="btn" onClick={() => dispatch({ type: 'bomb', cmd: { type: 'depressurize' } })}>{t('p6.bomb.vent')}</button>}
      <button className="btn" onClick={ack}>{t('p3.block.reset')}</button>
    </div>
  );
}
