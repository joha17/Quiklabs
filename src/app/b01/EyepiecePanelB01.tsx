import { useTranslation } from 'react-i18next';
import { useB01 } from './store';
import { OpticalEyepiece } from '../../engine/instruments/optical/OpticalEyepiece';
import { microscopeStatus, stereoStatus } from './describe';

/**
 * Panel del ocular: la vista ilustrada derivada del estado físico, su alternativa textual de ESTADO OPERATIVO
 * (objetivo, luz, enfoque, muestra) y los botones Registrar / Cerrar. No nombra estructuras (§14.2).
 */
export function EyepiecePanelB01() {
  const { t } = useTranslation();
  const version = useB01((s) => s.version);
  const rt = useB01((s) => s.runtime);
  const dispatch = useB01((s) => s.dispatch);
  const toast = useB01((s) => s.toast);
  const mode = useB01((s) => s.settings.mode);
  if (!rt) return null;
  const w = rt.world;
  const inst = w.view.instrument;
  if (!inst) return null;
  const labels = {
    illustrative: t('b01.eye.illustrative'), photo: t('b01.eye.photo'), mono: t('b01.eye.mono'), pair: t('b01.eye.pair'), dark: t('b01.eye.dark'), notLocked: t('b01.eye.notLocked'), noSample: t('b01.eye.noSample'),
  };
  const capture = () => {
    const r = dispatch({ type: 'captureObservation', instrument: inst });
    if (!r.ok && r.code) toast('warn', t(`b01.cmd.${r.code}`));
    else if (r.id) toast(r.value ? 'info' : 'warn', t(r.value ? 'b01.eye.recorded' : 'b01.eye.recordedInvalid', { id: r.id }));
  };
  return (
    <aside className="eyepiece-panel" aria-label={t(inst === 'compound' ? 'b01.eye.titleCompound' : 'b01.eye.titleStereo')}>
      <div className="p3-safety-head">
        <strong>🔬 {t(inst === 'compound' ? 'b01.eye.titleCompound' : 'b01.eye.titleStereo')}</strong>
        <button className="btn small ghost" onClick={() => dispatch({ type: 'observe', instrument: inst, open: false })} aria-label={t('b01.eye.close')}>×</button>
      </div>
      <OpticalEyepiece world={w} instrument={inst} labels={labels} version={version} size={300} />
      <p className="eyepiece-status" aria-live="polite">{inst === 'compound' ? microscopeStatus(w, mode) : stereoStatus(w)}</p>
      <div className="row">
        <button className="btn primary" onClick={capture}>📷 {t('b01.eye.capture')} (C)</button>
      </div>
    </aside>
  );
}
