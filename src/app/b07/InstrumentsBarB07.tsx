import { useTranslation } from 'react-i18next';
import { useB07 } from './store';
import { microscopeView } from '../../simulation/optical-world/world';

/**
 * Indicadores que el estudiante ve en los equipos: objetivo enclavado y aumento total, intensidad de la lámpara,
 * y apertura del diafragma. Son marcas de los mandos, no mediciones ocultas.
 */
export function InstrumentsBarB07() {
  const { t } = useTranslation();
  useB07((s) => s.version);
  const rt = useB07((s) => s.runtime);
  if (!rt) return null;
  const w = rt.world;
  const v = microscopeView(w);
  const m = w.microscope;
  return (
    <aside className="instruments-bar" aria-label={t('b07.instr.title')}>
      <span className={`instr${v.locked ? '' : ' unstable'}`}>
        <small>{t('b07.instr.objective')}</small>
        <strong aria-live="off">{v.locked ? `${v.objectiveX}X · ${v.magnification}X` : t('b07.instr.between')}</strong>
      </span>
      <span className={`instr${m.power ? '' : ' unstable'}`}>
        <small>{t('b07.instr.lamp')}</small>
        <strong aria-live="off">{m.power ? `${Math.round(m.light01 * 100)} % · ⌀ ${Math.round(m.diaphragm01 * 100)} %` : t('b07.instr.off')}</strong>
      </span>
      <span className="instr">
        <small>{t('b07.instr.plate')}</small>
        <strong aria-live="off">{w.micro.selectedPlate ? w.micro.plates[w.micro.selectedPlate].label : t('b07.instr.noPlate')}</strong>
      </span>
    </aside>
  );
}
