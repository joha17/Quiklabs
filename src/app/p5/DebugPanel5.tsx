import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP5 } from './store';
import { balanceTargetG, catalystActivity, conversion, elementTotals, expelledG, panTrueMassG, rateConstant, tubeMassG } from '../../simulation/stoich-world/world';
import { MOLAR_MASS } from '../../simulation/stoichiometry/stoich';

const f = (v: number | undefined, d = 3) => (v === undefined || !Number.isFinite(v) ? '—' : Math.abs(v) > 0 && Math.abs(v) < 10 ** -d ? v.toExponential(2) : v.toFixed(d));

/**
 * Modo docente: masa verdadera del platillo y la que equilibra, error de cero, composición del tubo, temperaturas,
 * constantes de rapidez, ciclos, balance de elementos y eventos. Incluye «detener simulación».
 */
export function DebugPanel5() {
  const { t } = useTranslation();
  useP5((s) => s.version);
  const rt = useP5((s) => s.runtime);
  const dispatch = useP5((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const b = w.balance;
  const tu = w.tube;
  const c = tu.contents;
  const k = rateConstant(w, tu.sampleC);
  const el = elementTotals(w);
  const drift = Object.keys(w.initialElements).map((x) => `${x} ${((el[x] ?? 0) - (w.initialElements[x] ?? 0)).toExponential(1)}`).join(' · ');
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
          <div>{t('debug.seed', { seed: w.seed, tick: w.tick })} · {b.state} · {tu.state}</div>
          <table>
            <tbody>
              <tr><td>platillo</td><td>{f(panTrueMassG(w), 4)} g</td><td>equilibrio</td><td>{f(balanceTargetG(w), 3)} g</td></tr>
              <tr><td>cero (err−tornillo)</td><td>{f(b.zeroErrorG - b.zeroScrewG, 3)} g</td><td>desnivel</td><td>{f(b.levelErrorDeg, 2)}°</td></tr>
              <tr><td>fiel</td><td>{f(b.pointer, 3)}</td><td>quieto</td><td>{f(b.quietS, 1)} s</td></tr>
              <tr><td>tubo</td><td>{f(tubeMassG(tu), 4)} g</td><td>conversión</td><td>{f(conversion(w) * 100, 1)} %</td></tr>
              <tr><td>KClO₃ / KCl / MnO₂</td><td colSpan={3}>{f(c.KClO3 * MOLAR_MASS.KClO3, 4)} / {f(c.KCl * MOLAR_MASS.KCl, 4)} / {f(c.MnO2 * MOLAR_MASS.MnO2, 4)} g · H₂O {f(c.waterG, 3)} g</td></tr>
              <tr><td>T vidrio / muestra / sup.</td><td colSpan={3}>{f(tu.glassC, 1)} / {f(tu.sampleC, 1)} / {f(tu.upperC, 1)} °C · tensión {f(tu.stress, 3)}</td></tr>
              <tr><td>k (cat / sin)</td><td colSpan={3}>{f(k.kCat, 6)} / {f(k.kUncat, 6)} s⁻¹ · actividad {f(catalystActivity(w), 2)} · homog. {f(tu.homogeneity, 2)}</td></tr>
              <tr><td>O₂</td><td>{f(tu.o2ReleasedMol * 1000, 3)} mmol</td><td>expulsado</td><td>{f(expelledG(w), 4)} g</td></tr>
            </tbody>
          </table>
          <div style={{ marginTop: 6 }}>
            <strong>ciclos</strong> {tu.cycles.map((cy) => `#${cy.index} ${Math.round(cy.heatedS)} s máx ${Math.round(cy.maxSampleC)} °C pérdida ${f(cy.solidLossG, 3)} g`).join(' · ') || '—'}
          </div>
          <div><strong>lecturas</strong> {w.measurements.slice(-6).map((m) => `${m.id} ${m.displayedMassG}${m.valid ? '' : `✗${m.invalidReason}`}`).join(' · ') || '—'}</div>
          <div><strong>balance</strong> {drift}</div>
          <div style={{ marginTop: 6 }}>
            <strong>{t('debug.events')}</strong>
            {w.events.slice(-8).reverse().map((e) => <div key={e.seq}>{e.t.toFixed(1)} s · {e.severity} · {e.code}</div>)}
          </div>
        </>
      )}
    </div>
  );
}
