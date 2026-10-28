import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB03 } from './store';
import { microscopeView } from '../../simulation/optical-world/world';
import { conservedPerm } from '../../simulation/perm-world/world';

const f = (v: number | undefined | null, d = 3) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));

/**
 * Modo docente (§7.2): estado real del microscopio y de los montajes (como en B02) y, de B03, cada cámara (membrana,
 * apriete, volúmenes y solutos de cada lado, fugas), los tubos, las membranas, el balance conservado y los eventos.
 */
export function DebugPanelB03() {
  const { t } = useTranslation();
  useB03((s) => s.version);
  const rt = useB03((s) => s.runtime);
  const dispatch = useB03((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const v = microscopeView(w);
  const c = conservedPerm(w);
  const P = w.perm;
  const vol = (x: { volumeMl: number; amounts: Record<string, number> }) => `${f(x.volumeMl, 2)} mL [sal ${f(x.amounts.salt, 3)} · traz ${f(x.amounts.tracer, 4)} · glu ${f(x.amounts.glucose, 2)} · prot ${f(x.amounts.protein, 1)}]`;
  const m = w.microscope;
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
          <div>{t('debug.seed', { seed: w.seed, tick: w.tick })} · escenarios: {w.scenarios.join(', ') || '—'} · asignación {w.assignment.assignmentHash.slice(0, 10)}</div>
          <div>platina X {f(m.stageXmm, 2)} Y {f(m.stageYmm, 2)} Z {f(v.stageZmm, 3)} mm · macro {f(m.coarseTurns, 2)} · micro {f(m.fineTurns, 2)} vueltas · revólver {m.turretDeg}° {v.locked ? `${v.objectiveX}X` : '(sin enclavar)'}</div>
          <div>gap {f(v.gapMm, 3)} mm · error de foco {f(v.focusErrorMm, 4)} mm · nitidez {f(v.sharpness01, 2)} · luminancia {f(v.luminance01, 2)} · contraste {f(v.contrast01, 2)} · {v.lightIssues.join(', ') || 'luz ok'}</div>
          <div>campo {f(v.fovMm, 2)} mm · centro [{v.centerMm.map((x) => f(x, 2)).join(', ')}] · activo {v.assetId ?? '—'} · visibles: {v.visible.join(', ') || '—'}{v.onBubble ? ' · SOBRE BURBUJA' : ''}</div>
          <table>
            <tbody>
              {Object.values(w.mounts).map((mt) => (
                <tr key={mt.slideId}>
                  <td>{mt.slideId}</td>
                  <td>{mt.cell ? `zonas ${mt.cell.zones.map((z) => `${z.specimenId}→${z.asset} e=${f(z.thicknessMm, 2)} A=${f(z.areaMm2, 1)}`).join(' | ')} · colorantes ${Object.entries(mt.cell.stainMl).map(([k, x]) => `${k} ${f(x, 3)} (${f(mt.cell!.contactS[k as never], 0)} s)`).join(', ') || '—'} · ` : ''}agua {f(mt.waterMl, 4)} mL · burbujas {f(mt.bubbleFraction, 2)} ({mt.bubbles.length}) · cubierto {f(mt.coveredFraction, 2)} · hidratación {f(mt.hydrated01, 2)} · daño {f(mt.damage01, 2)} · contaminación {f(mt.contamination01, 2)}{mt.broken ? ' · ROTO' : ''}{mt.floating ? ' · FLOTA' : ''}</td>
                </tr>
              ))}
              {Object.entries(P.cells).map(([id, cc]) => (
                <tr key={id}><td>{id}</td><td>membrana {cc.membraneId ?? '—'}{cc.membraneId ? ` (${P.membranes[cc.membraneId].material}, ${P.membranes[cc.membraneId].intact ? 'íntegra' : 'ROTA'}, húmeda ${f(P.membranes[cc.membraneId].wet01, 2)}, área ${f(P.membranes[cc.membraneId].areaFactor, 2)})` : ''} · apriete {f(cc.clampTurns, 2)} · A {vol(cc.sides.A)} · B {vol(cc.sides.B)} · fuga ext {f(cc.leakOutMl, 3)} cruce {f(cc.leakCrossMl, 3)}{cc.crossContaminated ? ' · SALPICADO' : ''} · tapa {cc.lidClosed ? 'sí' : 'no'}</td></tr>
              ))}
              {Object.entries(P.tubes).filter(([, x]) => x.label || x.sampleMl > 0).map(([id, x]) => (
                <tr key={id}><td>{id}</td><td>{x.label ?? 'sin rótulo'} · de {x.sources.join(', ') || '—'} · {vol(P.vessels[id])} · Biuret {f(P.vessels[id].biuretMl, 2)} · Ag {f(P.vessels[id].silverMmol, 4)} · AgCl {f(P.vessels[id].pptMmol, 4)}{x.readAt !== null ? ' · leído' : ''}{x.discarded ? ' · desechado' : ''}</td></tr>
              ))}
              <tr><td>balance</td><td>{Object.entries(c).map(([k, x]) => `${k.replace('perm:', '')} ${x.toExponential(1)}`).join(' · ')} · derrame {f(P.vessels.spill.volumeMl, 2)} mL · evaporado {f(P.evaporatedMl, 3)} mL · incidencias {[...w.cell.incidents, ...P.incidents].join(', ') || '—'}</td></tr>
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
