import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB05 } from './store';
import { microscopeView } from '../../simulation/optical-world/world';
import { clockS, conservedEnz } from '../../simulation/enz-world/world';
import { pHOf } from '../../simulation/enz-world/chemistry';
import type { EnzVessel } from '../../simulation/enz-world/types';

const f = (v: number | undefined | null, d = 3) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));

/**
 * Modo docente (§7.1): estado real del microscopio (como en B02) y, de B05, cada lote (agua, sólido, agitación,
 * temperatura máxima y medida, homogeneidad), cada tubo con sus especies, temperatura, pH y actividad, los baños, el
 * colector y el O₂ venteado o atrapado, el balance conservado por ledger y los eventos.
 */
export function DebugPanelB05() {
  const { t } = useTranslation();
  useB05((s) => s.version);
  const rt = useB05((s) => s.runtime);
  const dispatch = useB05((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const v = microscopeView(w);
  const c = conservedEnz(w);
  const E = w.enz;
  const sp = (x: EnzVessel) => `${f(x.volumeMl, 2)} mL ${f(x.tK - 273.15, 1)} °C pH ${f(pHOf(x.s, x.volumeMl), 1)} homog ${f(x.homog01, 2)} [H₂O₂ ${f(x.s.h2o2, 4)} O₂ ${f(x.s.o2, 4)} alm ${f(x.s.starch, 3)}+${f(x.s.starchSolid, 3)} dex ${f(x.s.dextrin, 3)} az ${f(x.s.sugar, 3)} I₂ ${f(x.s.iodine, 4)} Cu ${f(x.s.cu, 4)} Cu₂O ${f(x.s.cu2o, 4)} cat ${f(x.s.catAct, 2)}/${f(x.s.catTissue, 2)} (den ${f(x.s.catDen + x.s.catTissueDen, 2)}) amy ${f(x.s.amyAct, 2)} (sól ${f(x.s.amySolid, 2)} den ${f(x.s.amyDen, 2)}) NADH ${f(x.s.nadh, 5)}]`;
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
          <div>{t('debug.seed', { seed: w.seed, tick: w.tick })} · escenarios: {w.scenarios.join(', ') || '—'} · ADH {E.adhEnabled ? 'sí' : 'no'} · asignación {w.assignment.assignmentHash.slice(0, 10)}</div>
          <div>revólver {v.locked ? `${v.objectiveX}X` : '(sin enclavar)'} · gap {f(v.gapMm, 3)} mm · nitidez {f(v.sharpness01, 2)} · activo {v.assetId ?? '—'}</div>
          <div>cronómetros sw1 {f(clockS(w, 'sw1'), 1)} s · sw2 {f(clockS(w, 'sw2'), 1)} s · baños {Object.entries(E.baths).map(([id, b]) => `${id} ${b.on ? 'on' : 'off'} ${f(b.tK - 273.15, 2)} °C (consigna ${f(b.setK - 273.15, 1)}${b.offsetK ? ` +${b.offsetK}` : ''})${b.stableSince !== null ? ' estable' : ''}`).join(' · ')}</div>
          <div>colector {E.collector.tubeId ?? '—'} sello {f(E.collector.seal01, 2)} llave {E.collector.stopcockOpen ? 'abierta' : 'CERRADA'} gas {f(E.collector.gasMmol, 4)} mmol · venteado {f(E.o2.vented, 4)} · atrapado {Object.entries(E.o2.trapped).map(([k, x]) => `${k} ${f(x, 4)}`).join(', ') || '—'}</div>
          <table>
            <tbody>
              {Object.values(E.batches).filter(Boolean).map((b) => (
                <tr key={b!.id}><td>{b!.id}</td><td>{b!.vesselId} · sólido {f(b!.solidG, 2)} g · hígado {f(b!.liverG, 2)} g ({f(b!.sizeCm, 2)} cm) · agua {f(b!.waterMl, 1)} mL · agitado {f(b!.stirredS, 0)} s · calor {f(b!.heatedS, 0)} s · Tmáx {f(b!.maxTK - 273.15, 1)} · medida {b!.measuredTK ? f(b!.measuredTK - 273.15, 1) : '—'} · desliz {f(b!.slipS, 1)} s · {sp(E.vessels[b!.vesselId])}</td></tr>
              ))}
              {Object.entries(E.tubes).filter(([id, x]) => x.label || E.vessels[id].volumeMl > 0).map(([id, x]) => (
                <tr key={id}><td>{id}</td><td>{x.label ?? 'sin rótulo'} · {x.bath ? `${x.bath.id} (${f(x.bath.depth01, 1)})` : 'gradilla'} · reacción {x.reactionAt !== null ? f(x.reactionAt, 1) : '—'} · contacto {x.contactAt !== null ? f(x.contactAt, 1) : '—'}{x.aliquotOf ? ` · alícuota de ${x.aliquotOf} a ${f(x.sampledAfterS, 0)} s` : ''} · gotas L{x.drops.lugol} B{x.drops.benedict} H{x.drops.acid} N{x.drops.base} · calor {f(x.hotDoseS, 0)} s · {sp(E.vessels[id])}{x.discarded ? ' · descartado' : ''}</td></tr>
              ))}
              <tr><td>balance</td><td>{Object.entries(c).filter(([k]) => k.startsWith('enz:')).map(([k, x]) => `${k.replace('enz:', '')} ${x.toExponential(1)}`).join(' · ')} · derrame {f(E.vessels.spill.volumeMl, 2)} mL · evaporado {f(E.evaporatedMl, 3)} mL · incidencias {[...w.cell.incidents, ...E.incidents].join(', ') || '—'}</td></tr>
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
