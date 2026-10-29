import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB04 } from './store';
import { microscopeView } from '../../simulation/optical-world/world';
import { conservedBio } from '../../simulation/bio-world/world';
import type { BioVessel } from '../../simulation/bio-world/types';

const f = (v: number | undefined | null, d = 3) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));

/**
 * Modo docente (§7.2): estado real del microscopio (como en B02) y, de B04, los lotes P1–P3, las placas, los baños,
 * cada tubo usado (rótulo, fuentes, volumen, temperatura y especies principales), el balance conservado y los eventos.
 */
export function DebugPanelB04() {
  const { t } = useTranslation();
  useB04((s) => s.version);
  const rt = useB04((s) => s.runtime);
  const dispatch = useB04((s) => s.dispatch);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const v = microscopeView(w);
  const c = conservedBio(w);
  const B = w.bio;
  const vol = (x: BioVessel) => `${f(x.volumeMl, 2)} mL ${f(x.tK - 273.15, 1)} °C [alm ${f(x.s.starch, 3)}+${f(x.s.starchSolid, 2)} · dex ${f(x.s.dextrin, 3)} · mal ${f(x.s.maltose, 4)} · glu ${f(x.s.glucose, 4)} · prot ${f(x.s.proteinMg, 1)} · líp ${f(x.s.lipidMg, 1)} · I ${f(x.s.iodine, 4)} · Cu ${f(x.s.cu, 4)} · Cu₂O ${f(x.s.cu2o, 4)} · H₂O₂ ${f(x.s.h2o2, 3)} · cat ${f(x.s.catAct, 2)}/${f(x.s.catDen, 2)} · amy ${f(x.s.amyAct, 2)}/${f(x.s.amyDen, 2)} · NADH ${f(x.s.nadh, 5)}] h ${f(x.homog01, 2)}`;
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
              {Object.values(B.preps).filter(Boolean).map((p) => (
                <tr key={p!.id}><td>{p!.id}</td><td>{p!.vesselId} · sólido {f(p!.solidG, 3)} g · agua {f(p!.waterMl, 2)} mL · hígado {f(p!.liverG, 2)} g · agitado {f(p!.stirredS, 0)} s · calor {f(p!.heatedS, 0)} s · Tmáx {f(p!.maxTK - 273.15, 1)} °C · medida {p!.measuredTK ? f(p!.measuredTK - 273.15, 1) : '—'} · accesible {f(p!.accessible01, 2)} · salpicado {f(p!.splashMl, 2)}{p!.labeled ? ' · rotulado' : ''} · {vol(B.vessels[p!.vesselId])}</td></tr>
              ))}
              {Object.entries(B.plates).map(([id, p]) => <tr key={id}><td>{id}</td><td>{p.on ? 'ON' : 'off'} consigna {f(p.setK - 273.15, 0)} °C · placa {f(p.plateK - 273.15, 1)} °C · {p.rpm} rpm · {p.vesselId ?? '—'}</td></tr>)}
              {Object.entries(B.baths).map(([id, b]) => <tr key={id}><td>{id}</td><td>{b.on ? 'ON' : 'off'} consigna {f(b.setK - 273.15, 0)} °C · agua {f(b.tK - 273.15, 1)} °C{b.readyAt !== null ? ' · listo' : ''}</td></tr>)}
              {Object.entries(B.tubes).filter(([k, x]) => x.label || B.vessels[k].volumeMl > 0).map(([id, x]) => (
                <tr key={id}><td>{id}</td><td>{x.label ?? 'sin rótulo'} · de {x.sources.join(', ') || '—'} · reactivos {Object.keys(x.reagents).join(', ') || '—'} · {vol(B.vessels[id])}{x.condition ? ` · cond ${x.condition}` : ''}{x.o2CollectedMmol + x.o2LostMmol > 0 ? ` · O₂ ${f(x.o2CollectedMmol, 4)}/${f(x.o2LostMmol, 4)} mmol` : ''}{x.readAt !== null ? ' · leído' : ''}{x.discarded ? ' · desechado' : ''}</td></tr>
              ))}
              <tr><td>balance</td><td>{Object.entries(c).filter(([k]) => k.startsWith('bio:')).map(([k, x]) => `${k.replace('bio:', '')} ${x.toExponential(1)}`).join(' · ')} · derrame {f(B.vessels.spill.volumeMl, 2)} mL · evaporado {f(B.evaporatedMl, 3)} mL · incidencias {[...w.cell.incidents, ...B.incidents].join(', ') || '—'}</td></tr>
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
