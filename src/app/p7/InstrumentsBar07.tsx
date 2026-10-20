import { useTranslation } from 'react-i18next';
import { useP07 } from './store';
import { meterDisplay } from '../../simulation/bonding-world/world';
import { quantize } from '../../simulation/metrology/uncertainty';

/**
 * Pantallas de los instrumentos digitales tal como se ven en la escena (balanza, detector, conductímetro): con su
 * retardo, rango, estabilidad y resolución. Es la misma información que el instrumento, ni más ni menos (§15.1).
 */
export function InstrumentsBar07() {
  const { t } = useTranslation();
  useP07((s) => s.version);
  const rt = useP07((s) => s.runtime);
  if (!rt) return null;
  const w = rt.world;
  const b = w.balance;
  const d = w.detector;
  const m = w.meter;
  const f = (v: number, dd: number) => v.toFixed(dd).replace('.', ',');
  const bal = quantize(b.shownG, w.params.balance.resolutionG);
  const rng = d.range === 'LOW' ? { max: 2, res: 0.001 } : { max: 20, res: 0.01 };
  const k = meterDisplay(w);
  return (
    <aside className="instruments-bar" aria-label={t('p7.instr.title')}>
      <span className={`instr bal${b.powered && b.stable ? '' : ' unstable'}`}>
        <small>{t('p7.instr.balance')}</small>
        <strong aria-live="off">{b.powered ? `${f(bal, 2)} g ${b.stable ? '●' : '~'}` : t('p7.instr.off')}</strong>
      </span>
      <span className={`instr${d.powered ? '' : ' unstable'}`}>
        <small>{t('p7.instr.detector')}</small>
        <strong aria-live="off">
          {d.powered ? `${d.shownMA > rng.max ? t('p7.instr.overRange') : `${f(quantize(d.shownMA, rng.res), d.range === 'LOW' ? 3 : 2)} mA`} ${d.indicator01 > 0 ? '💡' : '○'}` : t('p7.instr.off')}
        </strong>
      </span>
      <span className={`instr${m.powered && m.stable ? '' : ' unstable'}`}>
        <small>{t('p7.instr.meter')}</small>
        <strong aria-live="off">
          {m.powered ? `${k.over ? t('p7.instr.overRange') : `${f(k.value, k.unit === 'mS/cm' ? 2 : m.range === 'LOW' ? 1 : 0)} ${k.unit}`} ${m.stable ? '●' : '~'} · ${f(m.probeTempC, 1)} °C` : t('p7.instr.off')}
        </strong>
      </span>
    </aside>
  );
}
