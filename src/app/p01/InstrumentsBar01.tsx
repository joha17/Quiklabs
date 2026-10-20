import { useTranslation } from 'react-i18next';
import { useP01 } from './store';
import { balanceDisplayG } from '../../simulation/density-world/world';
import { quantize } from '../../simulation/metrology/uncertainty';

/**
 * Pantallas de los instrumentos digitales (balanza y termómetro), tal como se ven en la escena: con su retardo,
 * estabilidad y resolución. No muestra la probeta, la pipeta ni el calibrador: esos se leen en el instrumento.
 */
export function InstrumentsBar01() {
  const { t } = useTranslation();
  useP01((s) => s.version);
  const rt = useP01((s) => s.runtime);
  if (!rt) return null;
  const w = rt.world;
  const b = w.balance;
  const shown = balanceDisplayG(w);
  const th = w.thermometer;
  const f = (v: number, d: number) => v.toFixed(d).replace('.', ',');
  return (
    <aside className="instruments-bar" aria-label={t('p01.instr.title')}>
      <span className={`instr bal${b.powered && b.stable ? '' : ' unstable'}`}>
        <small>{t('p01.instr.balance')}</small>
        <strong aria-live="off">{b.powered ? `${Number.isFinite(shown) ? f(shown, 2) : '—'} g ${b.stable ? '●' : '~'}` : t('p01.instr.off')}</strong>
      </span>
      {th.where !== 'air' && (
        <span className="instr bath">
          <small>{t('p01.instr.thermo')}</small>
          <strong aria-live="off">{f(quantize(th.displayedC + th.biasC, th.resolutionC), 1)} °C</strong>
        </span>
      )}
    </aside>
  );
}
