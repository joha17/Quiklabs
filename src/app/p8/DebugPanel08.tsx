import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP08 } from './store';
import { conservedTotals08, conversion, phasesOf, pressureKPa, vesselMl } from '../../simulation/organic-world/world';
import { liquidMl, massG, speciesIn } from '../../simulation/organic-chemistry/species';
import type { Mol } from '../../simulation/organic-world/types';

const f = (v: number | undefined | null, d = 3) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const mmol = (m: Mol) => speciesIn(m, 1e-7).map((k) => `${k} ${f((m[k] ?? 0) * 1000, 2)}`).join(' · ') || '—';

/**
 * Modo docente (§15 `teacher`): inspector de balance y modelos — composición en mmol por recipiente (líquido y
 * sólido), fases, temperatura, conversión, presión del embudo, compartimentos de pérdida (mesada, campana,
 * analizador), deriva de la conservación por elemento, escenarios y últimos eventos. No es una entrega del alumno.
 */
export function DebugPanel08() {
  const { t } = useTranslation();
  useP08((s) => s.version);
  const rt = useP08((s) => s.runtime);
  const dispatch = useP08((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const c = conservedTotals08(w);
  const drift = Object.keys(c).map((k) => Math.abs(c[k] - (w.initialElements[k as keyof typeof w.initialElements] ?? 0))).reduce((a, b) => Math.max(a, b), 0);
  const busy = Object.values(w.vessels).filter((v) => !v.id.startsWith('jar') && !v.id.startsWith('bt') && v.id !== 'washBottle' && (vesselMl(v) > 0.01 || massG(v.solid) > 0.0005));
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
          <div>{t('debug.seed', { seed: w.seed, tick: w.tick })} · ruta {w.route} · escenarios: {w.scenarios.join(', ') || '—'}</div>
          <div>conversión {f(conversion(w) * 100, 1)} % · baño {f(w.plate.bathTempC, 1)} °C · sesgo termómetro {f(w.thermometer.biasC, 2)} °C · P embudo {f(pressureKPa(w), 1)} kPa</div>
          <table>
            <tbody>
              {busy.slice(0, 16).map((v) => {
                const ph = phasesOf(v);
                return (
                  <tr key={v.id}>
                    <td>{v.id}</td>
                    <td>{f(vesselMl(v), 2)} mL · {f(v.tempC, 1)} °C{ph.twoPhases ? ` · abajo ${f(liquidMl(ph.bottom), 2)} mL (${ph.bottomIsOrganic ? 'org' : 'aq'})` : ''}</td>
                    <td>líq {mmol(v.liq)}</td>
                    <td>sól {mmol(v.solid)}</td>
                  </tr>
                );
              })}
              <tr><td>mesada</td><td colSpan={3}>{mmol(w.outside.bench)}</td></tr>
              <tr><td>campana</td><td colSpan={3}>{mmol(w.outside.exhaust)}</td></tr>
              <tr><td>analizador</td><td colSpan={3}>{mmol(w.outside.analyzerWaste)}</td></tr>
              <tr><td>balance</td><td colSpan={3}>máx. |Δ| por elemento {drift.toExponential(2)} mol</td></tr>
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
