import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB02 } from './store';
import { microscopeView, stereoView } from '../../simulation/optical-world/world';
import { conservedCell } from '../../simulation/cell-world/world';

const f = (v: number | undefined | null, d = 3) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));

/**
 * Modo docente (§7.2): estado real de la platina, la separación, el foco, la luz, el montaje (líquido, burbujas,
 * hidratación, daño, contaminación), IDs y regiones visibles, asignación congelada, conservación y eventos.
 */
export function DebugPanelB02() {
  const { t } = useTranslation();
  useB02((s) => s.version);
  const rt = useB02((s) => s.runtime);
  const dispatch = useB02((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const v = microscopeView(w);
  const s = stereoView(w);
  const c = conservedCell(w);
  const cell = w.cell;
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
          <div>estéreo zoom {f(s.zoomX, 1)} · foco {f(s.focusErrorMm, 2)} mm (nitidez {f(s.sharpness01, 2)}) · {s.lightIssues.join(', ') || 'luz ok'} · visibles: {s.visible.join(', ') || '—'}</div>
          <table>
            <tbody>
              {Object.values(w.mounts).map((mt) => (
                <tr key={mt.slideId}>
                  <td>{mt.slideId}</td>
                  <td>{mt.cell ? `zonas ${mt.cell.zones.map((z) => `${z.specimenId}→${z.asset} e=${f(z.thicknessMm, 2)} A=${f(z.areaMm2, 1)}`).join(' | ')} · colorantes ${Object.entries(mt.cell.stainMl).map(([k, x]) => `${k} ${f(x, 3)} (${f(mt.cell!.contactS[k as never], 0)} s)`).join(', ') || '—'} · ` : ''}agua {f(mt.waterMl, 4)} mL · burbujas {f(mt.bubbleFraction, 2)} ({mt.bubbles.length}) · cubierto {f(mt.coveredFraction, 2)} · hidratación {f(mt.hydrated01, 2)} · daño {f(mt.damage01, 2)} · contaminación {f(mt.contamination01, 2)}{mt.broken ? ' · ROTO' : ''}{mt.floating ? ' · FLOTA' : ''}</td>
                </tr>
              ))}
              <tr><td>balance</td><td>agua {c.water.toExponential(2)} mL · cubreobjetos {c.covers} · láminas {c.slides} · derrame {f(w.benchSpillMl, 3)} mL · biomasa {c.biomass.toExponential(2)} mg · {Object.entries(c).filter(([k]) => k.startsWith('stain:')).map(([k, x]) => `${k.slice(6)} ${x.toExponential(1)}`).join(' · ')}</td></tr>
              <tr><td>célula</td><td>asignadas {cell.assigned.join(', ')} · tabla {cell.board ? `${cell.board.kind} ${f(cell.board.thicknessMm, 2)} mm` : '—'} · pinza {cell.held.fc?.kind ?? '—'} · espátula {cell.held.sp?.kind ?? '—'} · restos {Object.entries(cell.toolResidue).filter(([, k]) => k).map(([t2, k]) => `${t2}:${k}`).join(', ') || '—'} · hisopos {Object.entries(cell.swabs).map(([id, x]) => `${id}:${x.state}`).join(', ')} · incidencias {cell.incidents.join(', ') || '—'}</td></tr>
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
