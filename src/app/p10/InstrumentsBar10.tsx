import { useTranslation } from 'react-i18next';
import { useP10 } from './store';
import { displayedBalance } from '../../simulation/instruments/analytical-balance';
import { sensorReading, SENSOR_PROFILES } from '../../simulation/instruments/pressure-sensor';

/**
 * Pantallas de los instrumentos (§32): balanza analítica, termómetro, barómetro y sensor de presión, tal como se ven
 * en la escena (con su retardo, estabilidad y resolución). No muestra la lectura de la bureta ni de la regla: esas se
 * leen en el instrumento, con el ojo a la altura correcta.
 */
export function InstrumentsBar10() {
  const { t } = useTranslation();
  useP10((s) => s.version);
  const rt = useP10((s) => s.runtime);
  if (!rt) return null;
  const w = rt.world;
  const b = w.balance;
  const res = w.params.balance.resolutionG;
  const shown = displayedBalance(b, w.params.balance, 0);
  const th = w.thermometer;
  const sensor = sensorReading(w.sensor);
  const prof = SENSOR_PROFILES[w.sensor.model];
  const f = (v: number, d: number) => v.toFixed(d).replace('.', ',');
  return (
    <aside className="instruments-bar" aria-label={t('p10.instr.title')}>
      <span className={`instr bal${b.stable && !b.doorsOpen ? '' : ' unstable'}`}>
        <small>{t('p10.instr.balance')}{b.doorsOpen ? ` · ${t('p10.instr.doorsOpen')}` : ''}</small>
        <strong aria-live="off">{Number.isFinite(shown) ? f(shown, res < 0.001 ? 4 : 3) : '—'} g {b.stable && !b.doorsOpen ? '●' : '~'}</strong>
      </span>
      {th.where !== 'air' && <span className="instr bath"><small>{t('p10.instr.thermo')}</small><strong aria-live="off">{f(Math.round((th.displayedC + th.offsetC) / th.resolutionC) * th.resolutionC, 1)} °C</strong></span>}
      {(w.syringe.connected || w.objects.syringe.support === 'sensor') && (
        <span className={`instr cal${w.sensor.overload ? ' over' : ''}`}>
          <small>{t('p10.instr.sensor', { kind: t(`p10.sensorKind.${prof.kind}`) })}</small>
          <strong aria-live="off">{Number.isFinite(sensor) ? f(sensor, 2) : '—'} kPa{w.sensor.overload ? ' ⚠' : ''}</strong>
        </span>
      )}
    </aside>
  );
}
