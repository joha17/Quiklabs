import { useTranslation } from 'react-i18next';
import { useB02 } from './store';
import { microscopeView, stereoView } from '../../simulation/optical-world/world';

/**
 * Indicadores que el estudiante ve en los equipos: objetivo enclavado y aumento total, intensidad de la lámpara,
 * apertura del diafragma y zoom del estereoscopio. Son marcas de los mandos, no mediciones ocultas.
 */
export function InstrumentsBarB02() {
  const { t } = useTranslation();
  useB02((s) => s.version);
  const rt = useB02((s) => s.runtime);
  if (!rt) return null;
  const w = rt.world;
  const v = microscopeView(w);
  const s = stereoView(w);
  const m = w.microscope;
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
      <span className={`instr${w.stereo.power ? '' : ' unstable'}`}>
        <small>{t('b02.instr.stereo')}</small>
        <strong aria-live="off">{`${s.zoomX.toFixed(1).replace('.', ',')}X · ${Math.round(s.magnification)}X`}</strong>
      </span>
    </aside>
  );
}
