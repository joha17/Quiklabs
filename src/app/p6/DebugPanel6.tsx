import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP6 } from './store';
import { activeRun, calorimeterEnergyJ, cupWaterC, displayedValue, metalGAt, totalMetalG, totalWaterG, tubeInBath } from '../../simulation/calorimetry-world/world';
import { bombInterlocks } from '../../simulation/calorimetry-world/bomb';

const f = (v: number | undefined | null, d = 3) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));

/**
 * Modo docente (§29): masas verdaderas, temperatura de cada nodo, lectura frente a verdad, balance de energía y de
 * masa, pérdidas, especie incógnita y su c efectivo, enclavamientos y energías de la bomba. Incluye «detener».
 */
export function DebugPanel6() {
  const { t } = useTranslation();
  useP6((s) => s.version);
  const rt = useP6((s) => s.runtime);
  const dispatch = useP6((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const c = w.cal;
  const run = activeRun(w);
  const b = w.bomb;
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
          <div>{t('debug.seed', { seed: w.seed, tick: w.tick })} · {w.params.model} · {w.params.cpModel} · incógnito {w.params.unknownMetal} ({f(w.sampleCp[w.params.unknownMetal], 4)}) · Fe {f(w.sampleCp.Fe, 4)}</div>
          <table>
            <tbody>
              <tr><td>agua vaso</td><td>{f(w.vessels.cup.waterG, 3)} g</td><td>T media</td><td>{f(cupWaterC(w), 3)} °C</td></tr>
              <tr><td>capa sup./inf.</td><td colSpan={3}>{f(c.topC, 3)} / {f(c.bottomC, 3)} °C · vaso {f(c.cupC, 3)} · metal {f(c.metalC, 3)} ({f(metalGAt(w, 'cup'), 3)} g)</td></tr>
              <tr><td>termómetro vaso</td><td>{f(displayedValue(w, 'therm_cal'), 1)} (sensor {f(w.thermos.therm_cal.sensorC, 3)})</td><td>baño</td><td>{f(displayedValue(w, 'therm_bath'), 1)} (verdad {f(w.vessels.beaker.waterC, 2)})</td></tr>
              <tr><td>energía sistema</td><td>{f(calorimeterEnergyJ(w), 1)} J</td><td>pérdida</td><td>{f(c.lossToAmbientJ, 1)} J</td></tr>
              <tr><td>agitación / tapa</td><td>{f(c.stir, 2)} / {c.lidClosed ? 'cerrada' : `abierta ${f(c.lidOpenS, 0)} s`}</td><td>estado</td><td>{c.state}</td></tr>
              <tr><td>plantilla</td><td>{f(w.plate.plateC, 1)} °C · {f(w.plate.powerW, 0)} W</td><td>baño</td><td>{f(w.vessels.beaker.waterG, 1)} g · ebull. {f(w.bath.boilingC, 2)} · vigor {f(w.bath.vigor, 2)}</td></tr>
              {Object.values(w.tubes).map((tb) => {
                const g = tubeInBath(w, tb.id);
                return <tr key={tb.id}><td>{tb.id}</td><td colSpan={3}>vidrio {f(tb.glassC, 2)} · metal {f(tb.metalC, 2)} ({f(metalGAt(w, `tube:${tb.id}`), 3)} g) · sumergido {f(g.metalSubmerged, 2)} · agua {f(tb.waterG, 2)} g · {Math.round(tb.boilingSoakS)} s</td></tr>;
              })}
              <tr><td>balances</td><td colSpan={3}>agua {f(totalWaterG(w) - w.initialWaterG, 6)} g · metal {f(totalMetalG(w) - w.initialMetalG, 6)} g · derramada {f(w.spilledG, 2)} g</td></tr>
            </tbody>
          </table>
          {run && <div><strong>ensayo {run.index}</strong> {run.metal} · Ti metal {f(run.metalCAtEntry, 2)} (al salir {f(run.metalCAtLift, 2)}, baño {f(run.bathCAtLift, 2)}) · traslado {f(run.transferS, 1)} s · máx. {f(run.peakDisplayedC, 1)}</div>}
          {w.params.bombEnabled && <div><strong>bomba</strong> {b.stage} · {f(b.pressureAtm, 0)} atm · C {f(b.effectiveJPerC, 0)} J/°C · q muestra {f(b.qSampleJ, 0)} · alambre {f(b.qWireJ, 1)} · aux {f(b.qAuxJ, 0)} J · enclavamientos: {bombInterlocks(w).join(', ') || '—'}</div>}
          <div style={{ marginTop: 6 }}>
            <strong>{t('debug.events')}</strong>
            {w.events.slice(-8).reverse().map((e) => <div key={e.seq}>{e.t.toFixed(1)} s · {e.severity} · {e.code}</div>)}
          </div>
        </>
      )}
    </div>
  );
}
