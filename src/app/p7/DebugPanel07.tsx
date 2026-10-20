import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP07 } from './store';
import { conservedTotals, detectorCurrentMA, trueKappaSPerM, vesselMl } from '../../simulation/bonding-world/world';
import { aqueousIons, compTotal, formalM, materialsIn } from '../../simulation/solution-properties/conservation';
import { concentrationFactor, idealInfiniteDilution } from '../../simulation/solution-properties/conductivity';
import { MATERIALS } from '../../simulation/solution-properties/materials';

const f = (v: number | undefined | null, d = 3) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));

/**
 * Modo docente (§1.3, §7.2 TEACHER_DEBUG): composición por fase de cada recipiente con contenido, concentraciones,
 * iones, κ verdadera e ideal (la diferencia del modelo de concentración finita es visible aquí, §8.2), corriente del
 * detector, identidad de las incógnitas, escenarios, balance de masa y últimos eventos. No es una entrega del alumno.
 */
export function DebugPanel07() {
  const { t } = useTranslation();
  useP07((s) => s.version);
  const rt = useP07((s) => s.runtime);
  const dispatch = useP07((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const c = conservedTotals(w);
  const drift = Object.keys({ ...c, ...w.initialTotals }).map((k) => Math.abs((c[k] ?? 0) - (w.initialTotals[k as keyof typeof w.initialTotals] ?? 0))).reduce((a, b) => Math.max(a, b), 0);
  const busy = Object.values(w.vessels).filter((v) => !v.id.startsWith('jar') && !v.id.startsWith('bt') && (vesselMl(v) > 0.01 || compTotal(v.solid) > 0.0005));
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
          <div>{t('debug.seed', { seed: w.seed, tick: w.tick })} · escenarios: {w.scenarios.join(', ') || '—'}</div>
          <div>incógnitas: {Object.entries(w.unknowns).map(([k, u]) => `${k} ${u.code} = ${u.material}`).join(' · ')}</div>
          <table>
            <tbody>
              {busy.slice(0, 14).map((v) => {
                const ions = aqueousIons(v.polar);
                const solute = materialsIn(v.polar).find((m) => MATERIALS[m].molarMassGmol && m !== 'water');
                return (
                  <tr key={v.id}>
                    <td>{v.id}</td>
                    <td>{f(vesselMl(v), 2)} mL · polar {materialsIn(v.polar).join('+') || '—'} · apolar {materialsIn(v.apolar).join('+') || '—'} · sólido {f(compTotal(v.solid), 4)} g</td>
                    <td>{solute ? `${solute} ${f(formalM(v.polar, solute), 5)} M` : ''}</td>
                    <td>κ {f(trueKappaSPerM(w, v) * 1e4, 1)} µS/cm · ideal {f(idealInfiniteDilution(ions) * 1e4, 1)} · f {f(concentrationFactor(ions), 3)}</td>
                  </tr>
                );
              })}
              <tr><td>detector</td><td colSpan={3}>{w.detector.powered ? 'encendido' : 'apagado'} · {w.detector.range} · I {f(detectorCurrentMA(w), 4)} mA · control {w.detector.controlTest} · A {w.detector.a?.targetId ?? '—'} · B {w.detector.b?.targetId ?? '—'}</td></tr>
              <tr><td>sonda</td><td colSpan={3}>{w.meter.vesselId ?? '—'} · inmersión {f(w.meter.immersionCm, 2)} cm · celda {f(w.meter.cellError, 3)} · cal {f(w.meter.calibFactor, 3)} · película {materialsIn(w.meter.film).join('+') || '—'} · T sonda {f(w.meter.probeTempC, 1)} °C</td></tr>
              <tr><td>balance</td><td colSpan={3}>máx. |Δ| por componente {drift.toExponential(2)} g · derrames {f(compTotal(w.spills.bench), 3)} g · equipo {f(compTotal(w.spills.electrics), 3)} g</td></tr>
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
