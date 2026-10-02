import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLab } from '../store';
import { capacityG } from '../../simulation/solutions/solubility';
import { SUBSTANCES } from '../../practices/practice-02/substances';
import { massBalance, conservationError } from '../../simulation/scoring/balance';
import { particulateMassG, sumRecord } from '../../simulation/solutions/mixture';

const f = (v: number | undefined, d = 3) => (v === undefined || !isFinite(v) ? '—' : v.toFixed(d));

/** Modo depuración docente (§19.9): masas, fases, concentración, temperatura y eventos. */
export function DebugPanel() {
  const { t } = useTranslation();
  useLab((s) => s.version);
  const rt = useLab((s) => s.runtime);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const rows = Object.values(w.vessels).filter((v) => v.integrity === 1 && v.support !== 'glass_waste' && (sumRecord(v.mix.solid) + sumRecord(v.mix.dissolved) + v.mix.waterG + v.mix.iceG + sumRecord(v.mix.oil) > 0.0005));
  const err = conservationError(w);
  return (
    <div className="debug" aria-label={t('debug.title')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{t('debug.title')}</strong>
        <button className="btn small" onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      {open && (
        <>
          <div>{t('debug.seed', { seed: w.seed, tick: w.tick })} · {t('debug.plate', { p: w.devices.hotplate.powerPct, t: w.devices.hotplate.plateTempC.toFixed(1) })}</div>
          <table>
            <thead>
              <tr><th>{t('debug.vessel')}</th><th>{t('debug.temp')}</th><th>{t('debug.water')}</th><th>KNO₃ aq</th><th>C</th><th>{t('debug.solid')}</th><th>{t('debug.crystals')}</th><th>{t('debug.conc')}</th><th>{t('debug.sat')}</th><th>{t('debug.phase')}</th></tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const cap = capacityG(SUBSTANCES.KNO3, v.temperatureC, v.mix.waterG);
                const d = v.mix.dissolved.KNO3 ?? 0;
                return (
                  <tr key={v.id}>
                    <td>{v.id}</td>
                    <td>{f(v.temperatureC, 1)}</td>
                    <td>{f(v.mix.waterG + v.mix.iceG, 3)}</td>
                    <td>{f(d)}</td>
                    <td>{f(v.mix.solid.CARBON)}</td>
                    <td>{f(particulateMassG(v.mix))}</td>
                    <td>{f(v.mix.crystals?.massG)}</td>
                    <td>{v.mix.waterG > 0 ? f((d / v.mix.waterG) * 100, 1) : '—'}</td>
                    <td>{cap > 0 ? f(d / cap, 2) : '—'}</td>
                    <td>{d > 0 || v.mix.crystals ? v.cryst.phase : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 6 }}>
            <strong>{t('nb.balance')}</strong>
            <table>
              <thead><tr><th>comp.</th><th>inicial</th><th>recip.</th><th>filtro</th><th>residuo</th><th>derram.</th><th>adher.</th><th>desc.</th><th>evap.</th><th>Δ</th></tr></thead>
              <tbody>
                {massBalance(w, ['KNO3', 'CARBON', 'IMP', 'H2O']).map((r) => (
                  <tr key={r.component}><td>{r.component}</td><td>{f(r.initial)}</td><td>{f(r.inVessels)}</td><td>{f(r.inFilter)}</td><td>{f(r.inResidue)}</td><td>{f(r.spilled)}</td><td>{f(r.adhered)}</td><td>{f(r.discarded)}</td><td>{f(r.evaporated)}</td><td>{r.residual.toExponential(1)}</td></tr>
                ))}
              </tbody>
            </table>
            <div>{t('debug.conservation')}: {Object.entries(err).map(([k, e]) => `${k} ${(e ?? 0).toExponential(1)}`).join(' · ')}</div>
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
