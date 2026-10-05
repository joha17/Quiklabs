import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP4 } from './store';
import { globalTotals, liquidMl, mergedCell, vesselOrigin, vesselPH } from '../../simulation/reaction-world/world';
import { saturationIndex } from '../../simulation/chemistry/mixture';
import { prettyFormula } from '../../simulation/chemistry/formula';

const f = (v: number | undefined, d = 3) => (v === undefined || !Number.isFinite(v) ? '—' : Math.abs(v) > 0 && Math.abs(v) < 10 ** -d ? v.toExponential(2) : v.toFixed(d));

/**
 * Modo docente (§30-15): especies y moles, pH, temperatura, Q/Ksp, avance de cada reacción, origen de los
 * volúmenes y balance global de átomos y carga. Incluye «detener simulación».
 */
export function DebugPanel4() {
  const { t } = useTranslation();
  useP4((s) => s.version);
  const rt = useP4((s) => s.runtime);
  const sel = useP4((s) => s.selected);
  const dispatch = useP4((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  const t0 = useMemo(() => (rt ? globalTotals(rt.world, rt.ctx) : {}), [rt]);
  if (!rt) return null;
  const w = rt.world;
  const id = sel && w.vessels[sel] ? sel : 'beaker';
  const v = w.vessels[id];
  const c = v ? mergedCell(v) : null;
  const tot = globalTotals(w, rt.ctx);
  const drift = Object.keys(t0).map((k) => `${k} ${((tot[k] ?? 0) - (t0[k] ?? 0)).toExponential(1)}`).join(' · ');
  return (
    <div className="debug" aria-label={t('debug.title')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{t('debug.title')}</strong>
        <span>
          <button className="btn small" onClick={() => dispatch({ type: 'teacherStop', on: !w.safety.stoppedByTeacher })}>{w.safety.stoppedByTeacher ? t('p3.debug.resume') : t('p3.debug.stop')}</button>{' '}
          <button className="btn small" onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
        </span>
      </div>
      {open && v && c && (
        <>
          <div>{t('debug.seed', { seed: w.seed, tick: w.tick })} · {id} · {v.rx}</div>
          <table>
            <tbody>
              <tr><td>V</td><td>{f(liquidMl(v), 3)} mL</td><td>pH</td><td>{f(vesselPH(v), 2)}</td></tr>
              <tr><td>T</td><td>{f(v.temperatureC, 2)} °C</td><td>calor</td><td>{f(v.heatJ, 2)} J</td></tr>
              <tr><td>penacho</td><td>{f(v.plume.volL * 1000, 3)} mL</td><td>agitación</td><td>{f(v.agitation, 2)} {v.agitationTool}</td></tr>
            </tbody>
          </table>
          <table style={{ marginTop: 6 }}>
            <thead><tr><th>especie</th><th>mol</th><th>M</th></tr></thead>
            <tbody>
              {Object.entries(c.mol).filter(([k]) => k !== 'H2O' && k !== 'EtOH').map(([k, m]) => (
                <tr key={k}><td>{prettyFormula(k.replace('(s)', '').replace('(aq)', ''))}{k.endsWith('(s)') ? ' (s)' : ''}</td><td>{f(m, 6)}</td><td>{c.volL > 0 ? f(m / c.volL, 4) : '—'}</td></tr>
              ))}
            </tbody>
          </table>
          <table style={{ marginTop: 6 }}>
            <thead><tr><th>sólido</th><th>log(Q/Ksp)</th><th>avance (mol)</th></tr></thead>
            <tbody>
              {rt.ctx.chem.precip.map((r) => {
                const si = saturationIndex(c, r, rt.ctx.chem, v.temperatureC);
                if (!Number.isFinite(si) && !v.extents[r.id]) return null;
                return <tr key={r.id}><td>{r.id}</td><td>{f(si, 2)}</td><td>{f(v.extents[r.id], 7)}</td></tr>;
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 6 }}>
            <strong>avances</strong> {Object.entries(v.extents).map(([k, x]) => `${k} ${f(x, 7)}`).join(' · ')}
          </div>
          <div><strong>origen (mL)</strong> {Object.entries(vesselOrigin(v)).map(([k, x]) => `${k} ${f(x, 3)}`).join(' · ')}</div>
          <div><strong>balance</strong> {drift}</div>
          <div style={{ marginTop: 6 }}>
            <strong>{t('debug.events')}</strong>
            {w.events.slice(-8).reverse().map((e) => <div key={e.seq}>{e.t.toFixed(1)} s · {e.severity} · {e.code} {e.vesselId ?? ''}</div>)}
          </div>
        </>
      )}
    </div>
  );
}
