import { useTranslation } from 'react-i18next';
import { useB08 } from './store';
import { OpticalEyepiece } from '../../engine/instruments/optical/OpticalEyepiece';
import { microscopeStatus } from './describe';

/**
 * Panel del ocular: la vista ilustrada derivada del estado físico, su alternativa textual de ESTADO OPERATIVO
 * (objetivo, luz, enfoque, muestra) y los botones Registrar / Cerrar. No nombra estructuras (§14.2).
 */
export function EyepiecePanelB08() {
  const { t } = useTranslation();
  const version = useB08((s) => s.version);
  const rt = useB08((s) => s.runtime);
  const dispatch = useB08((s) => s.dispatch);
  const toast = useB08((s) => s.toast);
  const mode = useB08((s) => s.settings.mode);
  if (!rt) return null;
  const w = rt.world;
  const inst = w.view.instrument;
  if (!inst) return null;
  const labels = {
    illustrative: t('b08.eye.illustrative'), photo: t('b08.eye.photo'), mono: t('b08.eye.mono'), pair: t('b08.eye.pair'), dark: t('b08.eye.dark'), notLocked: t('b08.eye.notLocked'), noSample: t('b08.eye.noSample'), missing: t('b08.eye.missing'),
  };
  const capture = () => {
    const r = dispatch({ type: 'captureObservation', instrument: inst });
    if (!r.ok && r.code) toast('warn', t(`b08.cmd.${r.code}`));
    else if (r.id) toast(r.value ? 'info' : 'warn', t(r.value ? 'b08.eye.recorded' : 'b08.eye.recordedInvalid', { id: r.id }));
  };
  return (
    <aside className="eyepiece-panel" aria-label={t('b08.eye.titleCompound')}>
      <div className="p3-safety-head">
        <strong>🔬 {t('b08.eye.titleCompound')}</strong>
        <button className="btn small ghost" onClick={() => dispatch({ type: 'observe', instrument: inst, open: false })} aria-label={t('b08.eye.close')}>×</button>
      </div>
      <OpticalEyepiece world={w} instrument={inst} labels={labels} version={version} size={300} />
      <p className="eyepiece-status" aria-live="polite">{microscopeStatus(w, mode)}</p>
      <div className="row">
        <button className="btn primary" onClick={capture}>📷 {t('b08.eye.capture')} (C)</button>
      </div>
    </aside>
  );
}
