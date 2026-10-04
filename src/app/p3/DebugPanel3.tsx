import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP3 } from './store';
import { activeEmitters, emitterSpectrum, flameBaseSpectrum, gasFlows, loopResidueMg } from '../../simulation/flame-world/world';
import { addScaled, applyFilter, emptySpectrum } from '../../simulation/spectroscopy/spectrum';
import { CTX3 } from '../../practices/practice-03';
import { SpectrumChart } from './SpectrumChart';

const f = (v: number | undefined, d = 2) => (v === undefined || !isFinite(v) ? '—' : v.toFixed(d));
const sp = (r: Record<string, number>) => Object.entries(r).filter(([, v]) => v > 1e-6).map(([k, v]) => `${k} ${v < 0.001 ? v.toExponential(1) : v.toFixed(3)}`).join(' ');

/**
 * Modo docente (§28-14): gas, aire, régimen, temperatura, CO, hollín, espectro y contaminación. Incluye la vista
 * espectral ampliada (solo docente, §9.5) y el botón «detener simulación» (§15.4).
 */
export function DebugPanel3() {
  const { t } = useTranslation();
  useP3((s) => s.version);
  const rt = useP3((s) => s.runtime);
  const dispatch = useP3((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const b = w.burner;
  const fl = b.flame;
  const fls = gasFlows(w);
  const base = flameBaseSpectrum(w, CTX3);
  const em = activeEmitters(w, CTX3)[0];
  const spec = emptySpectrum();
  addScaled(spec, base, 1);
  if (em) {
    const rates = w.loops[em.id]?.emissionRates ?? {};
    addScaled(spec, emitterSpectrum(rates, CTX3, w.params.emissionScale), 1);
  }
  return (
    <div className="debug" aria-label={t('debug.title')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{t('debug.title')}</strong>
        <span>
          <button className="btn small" onClick={() => dispatch({ type: 'teacherStop', on: !w.safety.stoppedByTeacher })}>{w.safety.stoppedByTeacher ? t('p3.debug.resume') : t('p3.debug.stop')}</button>{' '}
          <button className="btn small" onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
        </span>
      </div>
      {open && (
        <>
          <div>{t('debug.seed', { seed: w.seed, tick: w.tick })} · {t('p3.debug.unknown', { n: w.unknown.number, c: w.unknown.cation, k: f(w.unknown.intensityFactor) })}</div>
          <table>
            <tbody>
              <tr><td>estado</td><td>{b.flameState}</td><td>régimen</td><td>{fl.regime}</td></tr>
              <tr><td>mesa / aguja / aire</td><td>{f(b.tableGasValve)} / {f(b.needleGasValve)} / {f(b.airCollar)}</td><td>flujo / fuga</td><td>{f(fls.burner, 3)} / {f(fls.leak, 3)}</td></tr>
              <tr><td>airMix</td><td>{f(fl.airMix, 3)}</td><td>estabilidad</td><td>{f(fl.stability)}</td></tr>
              <tr><td>altura / cono int.</td><td>{f(fl.heightCm, 1)} / {f(fl.innerConeHeightCm, 1)} cm</td><td>Tmáx</td><td>{f(fl.maxTempC, 0)} °C</td></tr>
              <tr><td>hollín / CO</td><td>{f(fl.sootRateMgS, 3)} / {f(fl.coRateMgS, 2)} mg/s</td><td>CO₂ (frac. C)</td><td>{f(fl.completeFraction)}</td></tr>
              <tr><td>CO sala / gas acum.</td><td>{f(w.room.coPpm, 1)} ppm / {f(w.room.gasAccumMl, 0)} mL</td><td>ventilación</td><td>{f(w.room.ventilation)}</td></tr>
              <tr><td>mechero / manguera</td><td>{f(b.bodyTemperatureC, 0)} / {f(w.hose.temperatureC, 0)} °C</td><td>integridad · dist.</td><td>{f(b.hoseIntegrity)} · {f(b.hoseDistanceFromFlameCm, 1)} cm</td></tr>
              <tr><td>cápsula</td><td>{f(w.objects.capsule?.temperatureC, 0)} °C · {f(w.capsule.sootMassMg, 3)} mg</td><td>vidrio</td><td>alin. {f(w.glass.alignment)} · limp. {f(w.glass.cleanliness)}</td></tr>
            </tbody>
          </table>
          <table style={{ marginTop: 6 }}>
            <thead><tr><th>asa</th><th>fase</th><th>T</th><th>agua</th><th>muestra</th><th>contaminación</th></tr></thead>
            <tbody>
              {Object.values(w.loops).map((l) => (
                <tr key={l.id}>
                  <td>{l.id.replace('loop_', '')}</td><td>{l.phase}</td><td>{f(l.temperatureC, 0)}</td><td>{f(l.surfaceWaterMg)}</td>
                  <td>{sp(l.depositedSpeciesMg)}</td><td>{loopResidueMg(l) > 0 ? sp(l.contaminationSpeciesMg) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table style={{ marginTop: 6 }}>
            <thead><tr><th>tubo</th><th>mL</th><th>contaminación (mg)</th><th>sin filtro</th><th>con filtro</th></tr></thead>
            <tbody>
              {Object.values(w.solutions).map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td><td>{f(s.volumeMl)}</td><td>{sp(s.contamination)}</td>
                  <td>{w.observations[s.id]?.noFilter?.region ?? ''}</td><td>{w.observations[s.id]?.filter?.region ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 6, color: '#dfe6ec' }}>
            <SpectrumChart raw={spec} filtered={applyFilter(spec, CTX3.cobalt, w.glass.cleanliness)} title={t('p3.spec.teacher')} />
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>{t('debug.events')}</strong>
            {w.events.slice(-8).reverse().map((e) => <div key={e.seq}>{e.t.toFixed(1)} s · {e.severity} · {e.code} {e.vesselId ?? ''}</div>)}
          </div>
        </>
      )}
    </div>
  );
}
