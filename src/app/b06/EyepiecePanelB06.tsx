import { useTranslation } from 'react-i18next';
import { useB06 } from './store';
import { OpticalEyepiece } from '../../engine/instruments/optical/OpticalEyepiece';
import { microscopeStatus, stereoStatus } from './describe';

/**
 * Panel del ocular: la vista ilustrada derivada del estado físico, su alternativa textual de ESTADO OPERATIVO
 * (objetivo, luz, enfoque, muestra) y los botones Registrar / Cerrar. No nombra estructuras (§14.2).
 */
export function EyepiecePanelB06() {
  const { t } = useTranslation();
  const version = useB06((s) => s.version);
  const rt = useB06((s) => s.runtime);
  const dispatch = useB06((s) => s.dispatch);
  const toast = useB06((s) => s.toast);
  const mode = useB06((s) => s.settings.mode);
  if (!rt) return null;
  const w = rt.world;
  const inst = w.view.instrument;
  if (!inst) return null;
  const labels = {
    illustrative: t('b06.eye.illustrative'), photo: t('b06.eye.photo'), mono: t('b06.eye.mono'), pair: t('b06.eye.pair'), dark: t('b06.eye.dark'), notLocked: t('b06.eye.notLocked'), noSample: t('b06.eye.noSample'), missing: t('b06.eye.missing'),
  };
  const capture = () => {
    const r = dispatch({ type: 'captureObservation', instrument: inst });
    if (!r.ok && r.code) toast('warn', t(`b06.cmd.${r.code}`));
    else if (r.id) toast(r.value ? 'info' : 'warn', t(r.value ? 'b06.eye.recorded' : 'b06.eye.recordedInvalid', { id: r.id }));
  };
  return (
    <aside className="eyepiece-panel" aria-label={t(inst === 'compound' ? 'b06.eye.titleCompound' : 'b06.eye.titleStereo')}>
      <div className="p3-safety-head">
        <strong>🔬 {t(inst === 'compound' ? 'b06.eye.titleCompound' : 'b06.eye.titleStereo')}</strong>
        <button className="btn small ghost" onClick={() => dispatch({ type: 'observe', instrument: inst, open: false })} aria-label={t('b06.eye.close')}>×</button>
      </div>
      <OpticalEyepiece world={w} instrument={inst} labels={labels} version={version} size={300} />
      <p className="eyepiece-status" aria-live="polite">{inst === 'compound' ? microscopeStatus(w, mode) : stereoStatus(w)}</p>
      <div className="row">
        <button className="btn primary" onClick={capture}>📷 {t('b06.eye.capture')} (C)</button>
      </div>
    </aside>
  );
}
