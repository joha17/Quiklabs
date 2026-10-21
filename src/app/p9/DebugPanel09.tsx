import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP09 } from './store';
import { conservedTotals09, effectiveLight, flowStatus, solidSplit, vesselMl } from '../../simulation/cation-analysis-world/world';
import { massG, speciesIn } from '../../simulation/cation-analysis-world/species';
import type { Mol } from '../../simulation/cation-analysis-world/types';

const f = (v: number | undefined | null, d = 3) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const mmol = (m: Mol) => speciesIn(m, 1e-9).map((k) => `${k} ${f((m[k] ?? 0) * 1000, 4)}`).join(' · ') || '—';

/**
 * Modo docente: inspector de balance y modelos — composición en mmol por recipiente (disuelto y sólido, con su
 * fracción en suspensión), composición real de la muestra, campana, llama y residuos del asa, compartimentos de
 * pérdida (mesada, extracción, bandeja), deriva de la conservación por elemento y carga, escenarios y últimos eventos.
 */
export function DebugPanel09() {
  const { t } = useTranslation();
  useP09((s) => s.version);
  const rt = useP09((s) => s.runtime);
  const dispatch = useP09((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const c = conservedTotals09(w);
  const drift = Object.keys(c).map((k) => Math.abs(c[k] - ((w.initialElements as Record<string, number>)[k] ?? 0))).reduce((a, b) => Math.max(a, b), 0);
  const busy = Object.values(w.vessels).filter((v) => !v.id.startsWith('db') && !v.id.startsWith('ctl') && v.id !== 'washBottle' && (vesselMl(v) > 0.01 || massG(v.solid) > 0.0005));
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
          <div>{t('debug.seed', { seed: w.seed, tick: w.tick })} · muestra {w.unknown.code}: {w.unknown.cations.join(', ') || '—'} · escenarios: {w.scenarios.join(', ') || '—'}</div>
          <div>campana {flowStatus(w)} · mampara {f(w.hood.sashCm, 0)} cm · luz efectiva {f(effectiveLight(w), 0)} % · llama {w.flame.ignited ? 'on' : 'off'} · tensión vidrio {f(w.flame.glassStress, 1)} s · rotor {f(w.centrifuge.rpm, 0)} rpm</div>
          <div>asa: carga {mmol(w.loop.load)} · residuo {mmol(w.loop.residue)} · {f(w.loop.tempC, 0)} °C</div>
          <table>
            <tbody>
              {busy.slice(0, 18).map((v) => {
                const sp = solidSplit(v);
                return (
                  <tr key={v.id}>
                    <td>{v.id}</td>
                    <td>{f(vesselMl(v), 2)} mL · susp {f(sp.susp * 1000, 2)} mg · sed {f(sp.pellet * 1000, 2)} mg</td>
                    <td>dis {mmol(v.liq)}</td>
                    <td>sól {mmol(v.solid)}</td>
                  </tr>
                );
              })}
              <tr><td>mesada</td><td colSpan={3}>{mmol(w.outside.bench)}</td></tr>
              <tr><td>extracción</td><td colSpan={3}>{mmol(w.outside.exhaust)}</td></tr>
              <tr><td>bandeja</td><td colSpan={3}>{mmol(w.outside.hoodTray)}</td></tr>
              <tr><td>balance</td><td colSpan={3}>máx. |Δ| por elemento y carga {drift.toExponential(2)} mol</td></tr>
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
