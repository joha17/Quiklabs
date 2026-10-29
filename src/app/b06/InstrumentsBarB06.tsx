import { useTranslation } from 'react-i18next';
import { useB06 } from './store';
import { microscopeView, stereoView } from '../../simulation/optical-world/world';

/**
 * Indicadores que el estudiante ve en los equipos: objetivo enclavado y aumento total, intensidad de la lámpara,
 * apertura del diafragma y zoom del estereoscopio. Son marcas de los mandos, no mediciones ocultas.
 */
export function InstrumentsBarB06() {
  const { t } = useTranslation();
  useB06((s) => s.version);
  const rt = useB06((s) => s.runtime);
  if (!rt) return null;
  const w = rt.world;
  const v = microscopeView(w);
  const s = stereoView(w);
  const m = w.microscope;
  return (
    <aside className="instruments-bar" aria-label={t('b06.instr.title')}>
      <span className={`instr${v.locked ? '' : ' unstable'}`}>
        <small>{t('b06.instr.objective')}</small>
        <strong aria-live="off">{v.locked ? `${v.objectiveX}X · ${v.magnification}X` : t('b06.instr.between')}</strong>
      </span>
      <span className={`instr${m.power ? '' : ' unstable'}`}>
        <small>{t('b06.instr.lamp')}</small>
        <strong aria-live="off">{m.power ? `${Math.round(m.light01 * 100)} % · ⌀ ${Math.round(m.diaphragm01 * 100)} %` : t('b06.instr.off')}</strong>
      </span>
      <span className={`instr${w.stereo.power ? '' : ' unstable'}`}>
        <small>{t('b06.instr.stereo')}</small>
        <strong aria-live="off">{`${s.zoomX.toFixed(1).replace('.', ',')}X · ${Math.round(s.magnification)}X`}</strong>
      </span>
    </aside>
  );
}
