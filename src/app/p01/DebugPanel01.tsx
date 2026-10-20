import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP01 } from './store';
import { conservedTotals, cylinderApparentMl, fluidMl, nailsSubmergedFraction, pipetteAboveMarkMl, pipetteMl } from '../../simulation/density-world/world';

const f = (v: number | undefined | null, d = 3) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));

/**
 * Modo docente (§10): estado físico verdadero (agua por recipiente y su temperatura, pipeta, menisco, aire atrapado,
 * clavos, calibrador, balanza), escenarios activos, balances de masa y últimos eventos. Incluye «detener».
 */
export function DebugPanel01() {
  const { t } = useTranslation();
  useP01((s) => s.version);
  const rt = useP01((s) => s.runtime);
  const dispatch = useP01((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const c = conservedTotals(w);
  const i0 = w.initialTotals;
  const p = w.pipette;
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
          <div>{t('debug.seed', { seed: w.seed, tick: w.tick })} · {w.params.convention} · escenarios: {w.scenarios.join(', ') || '—'}</div>
          <table>
            <tbody>
              {['waterRoom01', 'waterCold01', 'erlenmeyer150', 'cylinder50', 'waste01', 'spillTray01', 'benchSpill'].map((id) => (
                <tr key={id}><td>{id}</td><td>{f(w.fluids[id].waterG, 4)} g · {f(fluidMl(w.fluids[id]), 3)} mL</td><td>T</td><td>{f(w.fluids[id].tempC, 2)} °C · película {f(w.fluids[id].wetG, 3)} g</td></tr>
              ))}
              <tr><td>pipeta</td><td>{f(pipetteMl(w), 4)} mL · aire {f(p.airMl, 3)} · menisco {f(pipetteAboveMarkMl(w), 3)} mL</td><td>entrega real</td><td>{f(p.trueDeliverMl, 4)} mL · residuo {f(p.residualMl + p.filmExtraMl, 3)} · restos {f(p.residueG, 3)} g</td></tr>
              <tr><td>probeta</td><td>aparente {f(cylinderApparentMl(w), 3)} mL · aire {f(w.cylinder.trappedAirMl, 3)}</td><td>clavos</td><td>{w.nails.map((n) => `${n.id}:${n.where}`).join(' ')} · sumergido {f(nailsSubmergedFraction(w), 2)}</td></tr>
              <tr><td>balanza</td><td>{w.balance.powered ? 'encendida' : 'apagada'} · nivel {f(w.balance.levelErrorDeg, 1)}° · cero {f(w.balance.zeroBiasG, 2)} g</td><td>platillo</td><td>{w.balance.panIds.join(', ') || '—'} · mojado {f(w.balance.panWetG, 3)} g · sesión {w.balance.tareSession}</td></tr>
              <tr><td>cilindro</td><td>d {f(w.solid.diameterCm, 4)} · h {f(w.solid.heightCm, 4)} cm · ρ {f(w.solid.rhoGPerCm3, 3)}</td><td>calibrador</td><td>{w.caliper.target} · {f(w.caliper.apertureCm, 4)} cm · cero {f(w.caliper.zeroBiasCm, 3)}</td></tr>
              <tr><td>termómetro</td><td>{w.thermometer.where} · {f(w.thermometer.displayedC, 2)} °C · sesgo {f(w.thermometer.biasC, 1)}</td><td>baño</td><td>{f(w.bath.tempC, 1)} °C</td></tr>
              <tr><td>balances</td><td colSpan={3}>Δagua {(c.water - i0.waterMassG).toExponential(2)} g · Δmetal {(c.metal - i0.metalMassG).toExponential(2)} g · descartada {f(w.ledger.discardedG, 3)} · evaporada {f(w.ledger.evaporatedG, 3)}</td></tr>
            </tbody>
          </table>
          <div style={{ marginTop: 6 }}>
            <strong>{t('debug.events')}</strong>
            {w.events.slice(-8).reverse().map((ev) => <div key={ev.seq}>{ev.t.toFixed(1)} s · {ev.severity} · {ev.code}</div>)}
          </div>
        </>
      )}
    </div>
  );
}
