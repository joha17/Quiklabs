import { useTranslation } from 'react-i18next';
import { useB04 } from './store';
import { microscopeView } from '../../simulation/optical-world/world';
import { fmtTime } from './ui';

/**
 * Indicadores que el estudiante ve en los equipos: objetivo enclavado y aumento total, lámpara, la consigna y el
 * agitador de cada placa, la consigna y la luz «listo» de cada baño, y los cronómetros que el estudiante inició en los
 * tubos. Son marcas de los mandos y del reloj de pared, no mediciones ocultas (la temperatura real se LEE).
 */
export function InstrumentsBarB04() {
  const { t } = useTranslation();
  useB04((s) => s.version);
  const rt = useB04((s) => s.runtime);
  if (!rt) return null;
  const w = rt.world;
  const v = microscopeView(w);
  const m = w.microscope;
  const timers = Object.entries(w.bio.tubes).filter(([, x]) => x.timerAt !== null && !x.discarded).slice(-3);
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
      {Object.entries(w.bio.plates).filter(([, p]) => p.on || p.rpm > 0).map(([id, p]) => (
        <span key={id} className="instr">
          <small>{t(`b04.obj.${id}`)}</small>
          <strong aria-live="off">{p.on ? `${Math.round(p.setK - 273.15)} °C · ` : ''}{p.rpm} rpm</strong>
        </span>
      ))}
      {Object.entries(w.bio.baths).filter(([, b]) => b.on).map(([id, b]) => (
        <span key={id} className={`instr${b.readyAt !== null ? '' : ' unstable'}`}>
          <small>{t(`b04.obj.${id}`)}</small>
          <strong aria-live="off">{Math.round(b.setK - 273.15)} °C · {t(b.readyAt !== null ? 'b04.instr.ready' : 'b04.instr.heating')}</strong>
        </span>
      ))}
      {timers.map(([id, x]) => (
        <span key={id} className="instr timer">
          <small>{x.label ?? id}</small>
          <strong aria-live="off">{fmtTime(w.timeS - x.timerAt!)}</strong>
        </span>
      ))}
    </aside>
  );
}
