import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP07 } from './store';
import { compTotal, materialsIn } from '../../simulation/solution-properties/conservation';

const ORGANIC_BOTTLES = ['btHeptane', 'btEthanol', 'btIsopropanol', 'btAcetone', 'btMineralOil', 'btPetEther'];

/**
 * HUD de seguridad de la Práctica 7 (§11): EPP y guantes, frascos de disolvente abiertos, derrames en la mesada y
 * sobre el equipo eléctrico, residuos separados; las acciones de recuperación a la mano. Siempre visible.
 */
export function SafetyPanel07() {
  const { t } = useTranslation();
  useP07((s) => s.version);
  const rt = useP07((s) => s.runtime);
  const dispatch = useP07((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const bench = compTotal(w.spills.bench);
  const elec = compTotal(w.spills.electrics);
  const open07 = ORGANIC_BOTTLES.filter((id) => w.vessels[id] && w.vessels[id].capped === false);
  const crossmix = (w.evidence['err:waste_crossmix'] ?? 0) > 0;
  return (
    <aside className="p3-safety" aria-label={t('p7.safety.title')}>
      <div className="p3-safety-head">
        <strong>🛡 {t('p7.safety.title')}</strong>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      {open && (
        <>
          <dl className="p3-meters">
            <dt>{t('p7.safety.gloves')}</dt>
            <dd className={w.safety.ppe.gloves === 'nitrile' ? 'ok' : 'pending'}>{t(`p7.gloves.${w.safety.ppe.gloves}`)}</dd>
            <dt>{t('p7.safety.solvents')}</dt>
            <dd className={open07.length ? 'pending' : 'ok'}>{open07.length ? `▲ ${t('p7.safety.open', { n: open07.length })}` : `● ${t('p7.safety.capped')}`}</dd>
            <dt>{t('p7.safety.bench')}</dt>
            <dd className={bench > 0.5 ? 'pending' : 'ok'}>{bench > 0.05 ? t('p7.safety.spill', { g: bench.toFixed(1).replace('.', ',') }) : `● ${t('p7.safety.dry')}`}</dd>
            <dt>{t('p7.safety.electrics')}</dt>
            <dd className={elec > 0.05 ? 'bad' : 'ok'}>{elec > 0.05 ? `▲ ${t('p7.safety.wet')}` : `● ${t('p7.safety.dry')}`}</dd>
            <dt>{t('p7.safety.waste')}</dt>
            <dd className={crossmix ? 'pending' : 'ok'}>{crossmix ? `▲ ${t('p7.safety.crossmix')}` : `● ${t('p7.safety.separated')}`}</dd>
          </dl>
          <div className="row">
            {bench > 0.05 && <button className="btn small" onClick={() => dispatch({ type: 'cleanSpill', where: 'bench' })}>🧻 {t('p7.safety.cleanBench')}</button>}
            {elec > 0.05 && <button className="btn small danger" onClick={() => dispatch({ type: 'cleanSpill', where: 'electrics' })}>🧻 {t('p7.safety.cleanElectrics')}</button>}
            {open07.map((id) => <button key={id} className="btn small ghost" onClick={() => dispatch({ type: 'setCap', vesselId: id, capped: true })}>{t('p7.safety.capOne', { o: t(`p7.obj.${id}`) })}</button>)}
          </div>
          {materialsIn(w.vessels.wasteOrg?.polar ?? {}).includes('water') && <p className="hint">{t('p7.safety.orgHasWater')}</p>}
        </>
      )}
    </aside>
  );
}

/** Bloqueos: detienen la acción, explican el riesgo y ofrecen la recuperación; nunca un modal (§11.2). */
export function SafetyBanner07() {
  const { t } = useTranslation();
  useP07((s) => s.version);
  const rt = useP07((s) => s.runtime);
  const dispatch = useP07((s) => s.dispatch);
  const toast = useP07((s) => s.toast);
  if (!rt) return null;
  const w = rt.world;
  const ack = () => {
    const r = dispatch({ type: 'acknowledge' });
    if (!r.ok && r.code) toast('warn', t(`p7.block.ack_${r.code}`));
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
      <strong>⛔ {t(`p7.block.title_${code}`)}</strong>
      <span style={{ flex: 1, minWidth: '14rem' }}>{t(`p7.block.${code}`)}</span>
      {code === 'WET_ELECTRICS' && compTotal(w.spills.electrics) > 0.05 && <button className="btn" onClick={() => dispatch({ type: 'cleanSpill', where: 'electrics' })}>🧻 {t('p7.safety.cleanElectrics')}</button>}
      {code === 'UNCAPPED' && ORGANIC_BOTTLES.filter((id) => w.vessels[id]?.capped === false).map((id) => <button key={id} className="btn" onClick={() => dispatch({ type: 'setCap', vesselId: id, capped: true })}>{t('p7.safety.capOne', { o: t(`p7.obj.${id}`) })}</button>)}
      <button className="btn" onClick={ack}>{t('p3.block.reset')}</button>
    </div>
  );
}
