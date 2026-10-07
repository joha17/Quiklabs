import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP10 } from './store';
import { activeRun, elementTotals, headVolumeMl, solveBurette } from '../../simulation/gas-world/world';
import { deadVolumeMl } from '../../simulation/gas-world/boyle-rig';
import { expectedBoyle } from '../../practices/practice-10/expected-results';
import { MOLAR } from '../../simulation/gas-laws/stoich';

const f = (v: number | undefined | null, d = 3) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const e = (v: number | undefined | null) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toExponential(3));

/**
 * Modo docente (§34): masa y moles verdaderos, reactivo limitante, progreso, CO₂ gaseoso/acuoso/fugado/recogido,
 * presiones de cada compartimento, temperatura real del gas, altura con signo, volumen muerto, fuga de la jeringa y
 * exponente y residuos verdaderos. Incluye «detener».
 */
export function DebugPanel10() {
  const { t } = useTranslation();
  useP10((s) => s.version);
  const rt = useP10((s) => s.runtime);
  const dispatch = useP10((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const r = w.reactor;
  const e1 = w.liquids.erlenmeyer;
  const run = activeRun(w) ?? w.runs[w.runs.length - 1] ?? null;
  const b = w.burette;
  const s = b.inverted ? solveBurette(w) : null;
  const sy = w.syringe;
  const eb = expectedBoyle(w);
  const el = elementTotals(w);
  const i0 = w.initialElements;
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
          <div>{t('debug.seed', { seed: w.seed, tick: w.tick })} · {w.params.model} · vapor {w.params.vapor} · P {f(w.params.pressureKPa, 3)} kPa · balón real {f(w.flask.trueMarkMl, 3)} mL · pipeta real {f(w.pipette.trueDeliverMl, 3)} mL</div>
          <table>
            <tbody>
              <tr><td>NaHCO₃ vidrio/espátula</td><td>{f(w.solids.watchGlassG, 4)} / {f(w.solids.spatulaG, 4)} g</td><td>derramado</td><td>{f(w.solids.spilledG, 4)} g</td></tr>
              <tr><td>balón</td><td>{f(w.liquids.flask.ml, 3)} mL · {e(w.liquids.flask.nBicarb)} mol</td><td>mezcla</td><td>{f(w.flask.mix, 3)} ({w.flask.inversions} inv.)</td></tr>
              <tr><td>Erlenmeyer</td><td>{f(e1.ml, 2)} mL · NaHCO₃ {e(e1.nBicarb)} · ácido {e(e1.nAcid)}</td><td>CO₂(aq)</td><td>{e(e1.nCo2Aq)} mol</td></tr>
              <tr><td>reactor</td><td>{r.stage} · {f(r.pressureKPa, 3)} kPa · cabeza {f(headVolumeMl(w), 1)} mL</td><td>gas</td><td>aire {e(r.nAir)} · CO₂ {e(r.nCo2Gas)}</td></tr>
              {run && <tr><td>ensayo {run.index}</td><td colSpan={3}>limitante {run.limiting} · NaHCO₃ {e(run.nBicarb)} · ácido {e(run.nAcid)} · generado {e(run.co2Generated)} · a la bureta {e(run.co2Collected)} · disuelto (baño) {e(run.co2Dissolved)} · fuga {e(run.co2Leaked)} · escapó {e(run.co2Escaped)}</td></tr>}
              {s && <tr><td>bureta</td><td colSpan={3}>{b.stage} · gas {f(s.gasMl, 3)} mL ({f(b.gasC, 2)} °C) · P {f(s.pKPa, 3)} kPa · h {f(s.hMm, 1)} mm · lectura {f(s.readingMl, 2)} · aire inicial {f(b.initialAirMl, 2)} mL · desborde {e(b.overflowMol)}</td></tr>}
              <tr><td>baño</td><td>{f(w.liquids.beaker600.ml, 1)} mL · {f(w.bathC, 2)} °C</td><td>uniones</td><td>{Object.values(w.connections).map((c) => `${c.id}:${c.connectedTo ? (c.secured ? 'ok' : 'floja') : '—'}${c.kinkFraction > 0 ? ` doblez ${f(c.kinkFraction, 1)}` : ''}`).join(' · ')}</td></tr>
              <tr><td>jeringa</td><td colSpan={3}>marca {f(sy.markMl, 2)} mL · v {f(sy.velocityMlS, 2)} mL/s · P {f(sy.pressureKPa, 2)} kPa · T {f(sy.gasK - 273.15, 2)} °C · n {e(sy.nAir)} · fuga {e(sy.leakedMol)} · muerto {f(deadVolumeMl(w), 2)} mL</td></tr>
              <tr><td>ajuste verdadero</td><td colSpan={3}>n libre {f(eb.free?.n, 4)} · R² {f(eb.free?.r2, 5)} · PV {f(eb.pv.mean, 1)} ± {f(eb.pv.sd, 1)} · patrón {eb.pattern}</td></tr>
              <tr><td>balances</td><td colSpan={3}>ΔC {e(el.C - i0.C)} · ΔNa {e(el.Na - i0.Na)} · ΔH {e(el.H - i0.H)} · ΔO {e(el.O - i0.O)} mol · (NaHCO₃ {f(MOLAR.NaHCO3, 4)} g/mol)</td></tr>
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
