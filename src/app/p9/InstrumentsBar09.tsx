import { useTranslation } from 'react-i18next';
import { useP09 } from './store';
import { quantize } from '../../simulation/metrology/uncertainty';
import { flowStatus, sashOK } from '../../simulation/cation-analysis-world/world';

/**
 * Pantallas de los equipos tal como se ven en la escena (balanza, centrífuga, campana, emisor): con su retardo,
 * estabilidad y resolución. Es la misma información que el instrumento, ni más ni menos.
 */
export function InstrumentsBar09() {
  const { t } = useTranslation();
  useP09((s) => s.version);
  const rt = useP09((s) => s.runtime);
  if (!rt) return null;
  const w = rt.world;
  const b = w.balance;
  const f = (v: number, dd: number) => v.toFixed(dd).replace('.', ',');
  const bal = quantize(b.shownG, w.params.balance.resolutionG);
  const c = w.centrifuge;
  const flow = flowStatus(w);
  return (
    <aside className="instruments-bar" aria-label={t('p9.instr.title')}>
      <span className={`instr bal${b.powered && b.stable ? '' : ' unstable'}`}>
        <small>{t('p9.instr.balance')}</small>
        <strong aria-live="off">{b.powered ? (b.shownG > w.params.balance.capacityG ? t('p9.instr.overRange') : `${f(bal, 2)} g ${b.stable ? '●' : '~'}`) : t('p9.instr.off')}</strong>
      </span>
      <span className={`instr${c.rpm > 1 ? ' unstable' : ''}`}>
        <small>{t('p9.instr.centrifuge')}</small>
        <strong aria-live="off">{`${Math.round(c.rpm)} rpm · ${t(c.lidClosed ? 'p9.instr.lidClosed' : 'p9.instr.lidOpen')}`}</strong>
      </span>
      <span className={`instr${flow === 'valid' && sashOK(w) ? '' : ' unstable'}`}>
        <small>{t('p9.instr.hood')}</small>
        <strong aria-live="off">{t('p9.instr.hoodState', { flow: t(`p9.flow.${flow}`), cm: Math.round(w.hood.sashCm), light: w.hood.lightPct })}</strong>
      </span>
      <span className="instr">
        <small>{t('p9.instr.flame')}</small>
        <strong aria-live="off">{w.flame.ignited ? t('p9.instr.flameOn') : t('p9.instr.off')}</strong>
      </span>
    </aside>
  );
}
