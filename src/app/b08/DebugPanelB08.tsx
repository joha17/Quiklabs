import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB08 } from './store';
import { bandsOf, btbPh, conservedPhoto, lightAt } from '../../simulation/photo-world/world';

const f = (v: number | undefined | null, d = 3) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));

/** Modo docente (§7): estado real de los tubos, pH, bandas, balances y eventos; nunca se muestra fuera de DEBUG. */
export function DebugPanelB08() {
  const { t } = useTranslation();
  useB08((s) => s.version);
  const rt = useB08((s) => s.runtime);
  const dispatch = useB08((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const m = w.photo;
  return (
    <div className="debug" aria-label={t('debug.title')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{t('debug.title')}</strong>
        <span>
          <button className="btn small" onClick={() => dispatch({ type: 'teacherStop', on: !w.safety.stoppedByTeacher })}>{w.safety.stoppedByTeacher ? t('debug.resume') : t('debug.stop')}</button>
          <button className="btn small" onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
        </span>
      </div>
      {open && (
        <>
          <div>{t('debug.seed', { seed: w.seed, tick: w.tick })} · escenarios: {w.scenarios.join(', ') || '—'} · módulos gas {String(m.modules.gas)} btb {String(m.modules.btb)} pig {String(m.modules.pig)}</div>
          <table>
            <tbody>
              {Object.entries(m.tubes).map(([id, q]) => <tr key={id}><td>{id}</td><td>h {f(q.hMm, 2)} mm · T {f(q.tempC, 1)} °C · I {f(lightAt(w, id), 1)} · DIC {f(q.dicUmol, 1)} · O₂ gas {f(q.o2GasUmol, 2)} fuga {f(q.o2LeakUmol, 2)} · biomasa {f(q.biomassUmol, 2)}</td></tr>)}
              {Object.entries(m.btb).map(([id, q]) => <tr key={id}><td>{id}</td><td>pH {f(btbPh(w, id), 2)} · DIC {f(q.dicUmol, 2)} µmol · biomasa {f(q.biomassUmol, 2)}</td></tr>)}
              <tr><td>papel</td><td>frente {f(m.paper.frontMm, 1)} mm · {bandsOf(w).map((b) => `${b.id}:${f(b.centerMm, 1)}`).join(', ') || 'sin bandas'}</td></tr>
              <tr><td>balance</td><td>{Object.entries(conservedPhoto(w)).map(([k, v]) => `${k} ${Number(v).toExponential(1)}`).join(' · ')}</td></tr>
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
