import { useTranslation } from 'react-i18next';
import { useB05 } from './store';
import { microscopeView } from '../../simulation/optical-world/world';
import { clockS } from '../../simulation/enz-world/world';
import { fmtTime } from './ui';

/**
 * Indicadores que el estudiante ve en los equipos: objetivo enclavado y aumento, lámpara, los dos cronómetros (lo que
 * marca TU reloj, no el tiempo real del mundo), la consigna de cada baño con su luz de estabilidad y las rpm/calor de
 * las placas. Son marcas de los mandos y de las pantallas, no mediciones ocultas: la temperatura del líquido se lee
 * con el termómetro.
 */
export function InstrumentsBarB05() {
  const { t } = useTranslation();
  useB05((s) => s.version);
  const rt = useB05((s) => s.runtime);
  if (!rt) return null;
  const w = rt.world;
  const E = w.enz;
  const v = microscopeView(w);
  const m = w.microscope;
  return (
    <aside className="instruments-bar" aria-label={t('b02.instr.title')}>
      <span className={`instr${v.locked ? '' : ' unstable'}`}>
        <small>{t('b02.instr.objective')}</small>
        <strong aria-live="off">{v.locked ? `${v.objectiveX}X · ${v.magnification}X` : t('b02.instr.between')}</strong>
      </span>
      <span className={`instr${m.power ? '' : ' unstable'}`}>
        <small>{t('b02.instr.lamp')}</small>
        <strong aria-live="off">{m.power ? `${Math.round(m.light01 * 100)} %` : t('b02.instr.off')}</strong>
      </span>
      {(['sw1', 'sw2'] as const).map((id) => (
        <span key={id} className={`instr timer${E.clocks[id].running ? '' : ' unstable'}`}>
          <small>{t(`b05.instr.${id}`)}</small>
          <strong aria-live="off">{fmtTime(clockS(w, id))}</strong>
        </span>
      ))}
      {(['wb1', 'wb2'] as const).filter((id) => E.baths[id].on).map((id) => (
        <span key={id} className={`instr${E.baths[id].stableSince !== null ? '' : ' unstable'}`}>
          <small>{t(`b05.instr.${id}`)}</small>
          <strong aria-live="off">{t('b05.instr.setpoint', { c: (E.baths[id].setK - 273.15).toFixed(1).replace('.', ',') })} {E.baths[id].stableSince !== null ? '●' : '○'}</strong>
        </span>
      ))}
      {(['hp1', 'hp2'] as const).filter((id) => E.plates[id].heatOn || E.plates[id].rpm > 0).map((id) => (
        <span key={id} className="instr">
          <small>{t(`b05.instr.${id}`)}</small>
          <strong aria-live="off">{E.plates[id].rpm} rpm{E.plates[id].heatOn ? ` · 🔥 ${(E.plates[id].setK - 273.15).toFixed(0)} °C` : ''}</strong>
        </span>
      ))}
    </aside>
  );
}
