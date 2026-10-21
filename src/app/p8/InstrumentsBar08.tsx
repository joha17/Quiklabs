import { useTranslation } from 'react-i18next';
import { useP08 } from './store';
import { quantize } from '../../simulation/metrology/uncertainty';

/**
 * Pantallas de los equipos tal como se ven en la escena (balanza, termómetro, placa, módulo de fracciones): con su
 * retardo, estabilidad y resolución. Es la misma información que el instrumento, ni más ni menos (§15).
 */
export function InstrumentsBar08() {
  const { t } = useTranslation();
  useP08((s) => s.version);
  const rt = useP08((s) => s.runtime);
  if (!rt) return null;
  const w = rt.world;
  const b = w.balance;
  const f = (v: number, dd: number) => v.toFixed(dd).replace('.', ',');
  const bal = quantize(b.shownG, w.params.balance.resolutionG);
  const pl = w.plate;
  const fr = w.fractions;
  return (
    <aside className="instruments-bar" aria-label={t('p8.instr.title')}>
      <span className={`instr bal${b.powered && b.stable ? '' : ' unstable'}`}>
        <small>{t('p8.instr.balance')}</small>
        <strong aria-live="off">{b.powered ? (b.shownG > w.params.balance.capacityG ? t('p8.instr.overRange') : `${f(bal, 3)} g ${b.stable ? '●' : '~'}`) : t('p8.instr.off')}</strong>
      </span>
      <span className="instr">
        <small>{t('p8.instr.thermometer')}</small>
        <strong aria-live="off">{f(quantize(w.thermometer.shownC, 0.1), 1)} °C</strong>
      </span>
      <span className={`instr${pl.on ? '' : ' unstable'}`}>
        <small>{t('p8.instr.plate')}</small>
        <strong aria-live="off">{pl.on ? t('p8.instr.plateOn', { c: Math.round(pl.setpointC), s: Math.round(pl.stir01 * 100) }) : t('p8.instr.off')}</strong>
      </span>
      {w.objects.frac01 && (
        <span className="instr">
          <small>{t('p8.instr.fractions')}</small>
          <strong aria-live="off">{`${Math.round(fr.cutLoC)}–${Math.round(fr.cutHiC)} °C${fr.running ? ` · ${Math.round(fr.progress01 * 100)} %` : ''}`}</strong>
        </span>
      )}
    </aside>
  );
}
