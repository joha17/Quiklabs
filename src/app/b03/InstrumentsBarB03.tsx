import { useTranslation } from 'react-i18next';
import { useB03 } from './store';
import { microscopeView } from '../../simulation/optical-world/world';
import { fmtTime } from './ui';

/**
 * Indicadores que el estudiante ve en los equipos: objetivo enclavado y aumento total, lámpara y diafragma, el cero
 * del colorímetro y el cronómetro de la incubación de la ósmosis (desde la carga de la cámara 3). Son marcas de los
 * mandos y del reloj de pared, no mediciones ocultas.
 */
export function InstrumentsBarB03() {
  const { t } = useTranslation();
  useB03((s) => s.version);
  const rt = useB03((s) => s.runtime);
  if (!rt) return null;
  const w = rt.world;
  const v = microscopeView(w);
  const m = w.microscope;
  const c3 = w.perm.cells.c3;
  const c1 = w.perm.cells.c1;
  return (
    <aside className="instruments-bar" aria-label={t('b02.instr.title')}>
      <span className={`instr${v.locked ? '' : ' unstable'}`}>
        <small>{t('b02.instr.objective')}</small>
        <strong aria-live="off">{v.locked ? `${v.objectiveX}X · ${v.magnification}X` : t('b02.instr.between')}</strong>
      </span>
      <span className={`instr${m.power ? '' : ' unstable'}`}>
        <small>{t('b02.instr.lamp')}</small>
        <strong aria-live="off">{m.power ? `${Math.round(m.light01 * 100)} % · ⌀ ${Math.round(m.diaphragm01 * 100)} %` : t('b02.instr.off')}</strong>
      </span>
      {c1.tracerAt !== null && (
        <span className="instr timer">
          <small>{t('b03.instr.tracer')}</small>
          <strong aria-live="off">{fmtTime(w.timeS - c1.tracerAt)}</strong>
        </span>
      )}
      {c3.loadedAt !== null && (
        <span className="instr timer">
          <small>{t('b03.instr.osmosis')}</small>
          <strong aria-live="off">{fmtTime(w.timeS - c3.loadedAt)}</strong>
        </span>
      )}
    </aside>
  );
}
