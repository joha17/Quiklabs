import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB03 } from './store';
import { describeObject, b03NameOf } from './describe';
import { HoldButton } from './ui';
import type { PermCommand as CellCommand } from '../../simulation/perm-world/commands';
import type { PermController } from '../../engine/optical/permController';
import { TUBE_LABELS } from '../../simulation/perm-world/world';
import { spotsFor } from '../../engine/optical/layout';
import { CLEAN_TRAY, PREP_SPOT, SAMPLE_TRAY, STEREO_BASE } from '../../simulation/optical-world/geometry';
import { SOAK_DISH } from '../../simulation/perm-world/geometry';

const OFFSETS: Record<string, [number, number]> = { center: [0, 0], edge: [1.1, 0], off: [1.8, 0] };

const A11Y_KEY = 'b02.a11yControls';
const readA11y = () => {
  try {
    return localStorage.getItem(A11Y_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Panel de acciones de B03 (§14): alternativa accesible a cada gesto. Despacha EXACTAMENTE los mismos comandos del
 * dominio que el controlador: membrana al remojo y a la junta (centrada o desplazada), pinza de la cámara, tapa,
 * agitación, vertido desde frascos y probetas hacia el recipiente elegido, pipeta (volumen, aspirar, descargar,
 * enjuagar), rótulos, goteros de Biuret y AgNO₃, lecturas con su instrumento (el volumen con el ángulo real de la
 * cámara), cero del colorímetro, vaciado y desecho; y, como en B02, la pinza, los goteros de medios, el cubreobjetos,
 * los papeles y los mandos del microscopio. Nada se «resuelve» automáticamente.
 */
export function ActionPanelB03() {
  const { t } = useTranslation();
  useB03((s) => s.version);
  const rt = useB03((s) => s.runtime);
  const stage = useB03((s) => s.stage);
  const sel = useB03((s) => s.selected);
  const held = useB03((s) => s.held);
  const dispatch = useB03((s) => s.dispatch);
  const toast = useB03((s) => s.toast);
  const mode = useB03((s) => s.settings.mode);
  const demo = useB03((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
  const [pos, setPos] = useState<'center' | 'edge' | 'off'>('center');
  const [force, setForce] = useState(0.5);
  const [pressure, setPressure] = useState(0.4);
  const [pourTo, setPourTo] = useState('');
  const [pourTilt, setPourTilt] = useState(55);
  const [memCell, setMemCell] = useState('c1');
  const [memOffset, setMemOffset] = useState(0);
  const [tubeLabel, setTubeLabel] = useState<string>(TUBE_LABELS[0]);
  const [a11y, setA11y] = useState(readA11y);
  if (!rt) return null;
  const toggleA11y = () => {
    setA11y(!a11y);
    try {
      localStorage.setItem(A11Y_KEY, a11y ? '0' : '1');
    } catch {
      // Sin almacenamiento: la preferencia dura lo que la sesión.
    }
  };
  /** Mandos de un instrumento: plegados salvo que el estudiante pida la alternativa accesible. */
  const controls = (fn: () => void) => {
    add('a11y', <button className="btn ghost" aria-expanded={a11y} onClick={toggleA11y}>{a11y ? '▾' : '▸'} {t('b02.act.a11yControls')}</button>);
    if (a11y) fn();
  };
  const w = rt.world;
  const ctl = stage?.controller as PermController | undefined;
  const P = w.perm;
  const id = held ?? sel;
  const o = id ? w.objects[id] : undefined;

  const startNudge = (fn: () => void, ms = 120) => {
    if (nudge.current) window.clearInterval(nudge.current);
    fn();
    nudge.current = window.setInterval(fn, ms);
  };
  const stopNudge = () => {
    if (nudge.current) window.clearInterval(nudge.current);
    nudge.current = null;
  };
  const D = (c: CellCommand) => {
    const r = dispatch(c);
    if (!r.ok && r.code) {
      const k = `b02.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('b02.cmd.FAILED'));
    }
    return r;
  };
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, c: () => void, cls = 'btn') => add(key, <button className={cls} onClick={c}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const slider = (key: string, label: string, value: number, set: (v: number) => void, min = 0, max = 1, step = 0.05, out?: string) =>
    add(key, (
      <label className="slider">
        <span>{t(label)}</span>
        <input aria-label={t(label)} type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
        <output>{out ?? `${Math.round(value * 100)} %`}</output>
      </label>
    ));
  // Lámina en el área de preparación vegetal o, si no hay, en el área animal.
  const prepSlide = Object.values(w.objects).find((x) => x.support === 'prep')?.id ?? null;
  const cell = w.cell;
  const posSel = () => add('pos', (
    <label className="slider">
      <span>{t('b02.act.where')}</span>
      <select aria-label={t('b02.act.where')} value={pos} onChange={(e) => setPos(e.target.value as typeof pos)}>
        {Object.keys(OFFSETS).map((k) => <option key={k} value={k}>{t(`b02.act.pos_${k}`)}</option>)}
      </select>
    </label>
  ));
  const [dx, dy] = OFFSETS[pos];

  if (id && o) {
    if (o.movable && !held && o.support !== 'fc') btn('take', t('b02.act.take'), () => ctl?.beginDrag(id, true), 'btn ghost');
    if (held) {
      btn('drop', t('b02.act.release'), () => ctl?.release(), 'btn primary');
      hold('up', `▲ ${t('b02.act.up')}`, () => ctl?.nudgeHeight(0.5), 90);
      hold('down', `▼ ${t('b02.act.down')}`, () => ctl?.nudgeHeight(-0.5), 90);
      btn('cancel', t('b02.act.cancel'), () => ctl?.cancel(), 'btn ghost');
    }
    // ── Apoyos con nombre (como soltar en ese lugar) ──
    if (o.movable && (o.kind === 'slide' || o.kind === 'fixedSlide' || o.kind === 'leafSample' || o.kind === 'insectSample')) {
      for (const s of spotsFor(w, o.kind)) {
        if (s.id === o.support || s.id.startsWith('case:') && s.id.slice(5) !== w.slideCase.home[id]) continue;
        btn(`spot-${s.id}`, t(`b02.spot.${s.id.startsWith('case:') ? 'homeSlot' : s.id}`), () => {
          if (held) ctl?.release();
          const r = D({ type: 'setPose', id, pose: { x: s.x, y: s.y, z: s.z, rotationRad: 0 }, support: s.id });
          if (!r.ok) ctl?.layOnBench(id, o.pose.x, o.pose.y);
        }, 'btn ghost');
      }
      if (o.support !== 'bench') btn('bench', t('b02.act.toBench'), () => ctl?.layOnBench(id, o.pose.x, o.pose.y - 6), 'btn ghost');
    }
    if (o.kind === 'slide' || o.kind === 'fixedSlide') btn('flip', t('b02.act.flip'), () => D({ type: 'flipSlide', slideId: id }), 'btn ghost');
    switch (o.kind) {
      case 'forceps': {
        const h = w.forceps.holding;
        add('pr', (
          <label className="check"><input type="checkbox" checked={pressure > 0.6} onChange={(e) => setPressure(e.target.checked ? 0.9 : 0.3)} /> {t('b02.act.squeezeHard')}</label>
        ));
        if (cell.held.fc) {
          posSel();
          if (prepSlide) btn('placeTissue', t('b02.act.placeOnSlide'), () => D({ type: 'placeSpecimen', toolId: 'fc', targetId: prepSlide, dxCm: dx, dyCm: dy }), 'btn primary');
        } else if (!h) {
          btn('leaf', t('b02.act.pickLeaf'), () => D({ type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' }));
          const cv = Object.keys(w.covers).find((c) => w.covers[c].state === 'box');
          if (cv) btn('cover', t('b02.act.pickCover'), () => D({ type: 'grabCover', coverId: cv, toolId: 'fc' }));
          if (prepSlide && w.mounts[prepSlide]?.coverId) btn('lift', t('b02.act.liftCover'), () => D({ type: 'liftCover', slideId: prepSlide, toolId: 'fc' }), 'btn ghost');
          btn('clean', t('b02.act.cleanForceps'), () => D({ type: 'wipe', targetId: 'fc', toolId: 'lp' }), 'btn ghost');
        } else if (h.kind === 'specimen') {
          posSel();
          if (prepSlide) btn('place', t('b02.act.placeOnSlide'), () => D({ type: 'placeSpecimen', toolId: 'fc', targetId: prepSlide, dxCm: dx, dyCm: dy }), 'btn primary');
        } else if (h.kind === 'cover') {
          const c = w.covers[h.coverId];
          slider('tilt', 'b02.act.tilt', c.tiltDeg, (v) => D({ type: 'setCoverTilt', coverId: h.coverId, angleDeg: v }), 0, 90, 5, `${Math.round(c.tiltDeg)}°`);
          if (prepSlide) {
            btn('lowerSlow', t('b02.act.lowerSlow'), () => D({ type: 'lowerCover', coverId: h.coverId, slideId: prepSlide, speedCmS: 0.4, dxCm: 0, dyCm: 0 }), 'btn primary');
            btn('lowerFast', t('b02.act.lowerFast'), () => D({ type: 'lowerCover', coverId: h.coverId, slideId: prepSlide, speedCmS: 2.5, dxCm: 0, dyCm: 0 }));
          }
        } else {
          btn('toBase', t('b02.act.sampleToBase'), () => D({ type: 'placeSpecimen', toolId: 'fc', targetId: 'stereoBase', dxCm: pos === 'center' ? 0 : pos === 'edge' ? 1 : 2.2, dyCm: 0 }), 'btn primary');
          btn('toTray', t('b02.act.sampleToTray'), () => D({ type: 'placeSpecimen', toolId: 'fc', targetId: 'sampleTray', dxCm: h.sampleId === 'leaf1' ? -3 : 3, dyCm: 0 }));
          posSel();
        }
        break;
      }
      case 'dropperBottle':
        if (id === 'dBi' || id === 'dAg') {
          for (const [tid, tb] of Object.entries(P.tubes).filter(([k, x]) => !x.discarded && P.vessels[k].volumeMl > 0)) {
            btn(`drop-${tid}`, `💧 ${t('b03.act.dropInto', { o: b03NameOf(w, tid), l: tb.label ? t(`b03.tubeLabel.${tb.label}`) : '—' })}`, () => D({ type: 'squeezeDropper', dispenserId: id, targetId: tid, force01: 0.5, dxCm: 0, dyCm: 0 }));
          }
          break;
        }
        if (prepSlide) {
          posSel();
          slider('force', 'b02.act.force', force, setForce);
          btn('squeeze', `💧 ${t('b02.act.squeeze')}`, () => D({ type: 'squeezeDropper', dispenserId: id, targetId: prepSlide, force01: force, dxCm: dx, dyCm: dy }), 'btn primary');
        }
        for (const fx of Object.keys(w.slides).filter((s) => w.slides[s].kind === 'fixed' && w.objects[s].support === 'stage')) btn(`dropfx-${fx}`, t('b02.act.dropOnFixed'), () => D({ type: 'squeezeDropper', dispenserId: id, targetId: fx, force01: force, dxCm: 0, dyCm: 0 }), 'btn ghost');
        break;
      case 'paper':
        if (prepSlide) {
          btn('edge', t('b02.act.wipeEdge'), () => D({ type: 'wipe', targetId: prepSlide, toolId: 'pp', dxCm: 1.1, dyCm: 0 }), 'btn primary');
          btn('center', t('b02.act.wipeCenter'), () => D({ type: 'wipe', targetId: prepSlide, toolId: 'pp', dxCm: 0, dyCm: 0 }), 'btn ghost');
        }
        if (w.benchSpillMl > 0.005) btn('spill', t('b02.act.wipeSpill'), () => D({ type: 'wipe', targetId: 'bench', toolId: 'pp' }));
        break;
      case 'lensPaper':
        if (prepSlide) btn('slide', t('b02.act.cleanSlide'), () => D({ type: 'wipe', targetId: prepSlide, toolId: 'lp' }));
        for (const tl of ['fc'] as const) if (cell.toolResidue[tl] || w.forceps.dirty01 > 0.3) btn(`wipe-${tl}`, t('b02.act.wipeToolNamed', { o: b03NameOf(w, tl) }), () => D({ type: 'wipe', targetId: tl, toolId: 'lp' }));
        btn('lens', t('b02.act.cleanLens'), () => D({ type: 'wipe', targetId: 'mic:lens', toolId: 'lp' }));
        break;
      case 'towel':
        btn('lens', t('b02.act.cleanLensTowel'), () => D({ type: 'wipe', targetId: 'mic:lens', toolId: 'tw' }), 'btn ghost');
        break;
      case 'microscope': {
        const m = w.microscope;
        controls(() => {
          btn('power', `⏻ ${m.power ? t('b02.act.powerOff') : t('b02.act.powerOn')}`, () => D({ type: 'setPower', device: 'microscope', on: !m.power }));
          btn('clip', m.clipOpen ? t('b02.act.clipClose') : t('b02.act.clipOpen'), () => D({ type: 'openClip', open: !m.clipOpen }));
          slider('light', 'b02.act.light', m.light01, (v) => D({ type: 'setIllumination', device: 'microscope', value01: v }));
          slider('diaph', 'b02.act.diaphragm', m.diaphragm01, (v) => D({ type: 'setDiaphragm', value01: v }));
          slider('cond', 'b02.act.condenser', m.condenser01, (v) => D({ type: 'setCondenser', value01: v }));
          hold('xm', 'X −', () => D({ type: 'setStageXY', xMm: m.stageXmm - 0.2, yMm: m.stageYmm }));
          hold('xp', 'X +', () => D({ type: 'setStageXY', xMm: m.stageXmm + 0.2, yMm: m.stageYmm }));
          hold('ym', 'Y −', () => D({ type: 'setStageXY', xMm: m.stageXmm, yMm: m.stageYmm - 0.2 }));
          hold('yp', 'Y +', () => D({ type: 'setStageXY', xMm: m.stageXmm, yMm: m.stageYmm + 0.2 }));
          hold('cu', `${t('b02.act.coarse')} ▲`, () => D({ type: 'turnCoarse', deltaTurns: 0.1 }), 160);
          hold('cd', `${t('b02.act.coarse')} ▼`, () => D({ type: 'turnCoarse', deltaTurns: -0.1 }), 160);
          hold('fu', `${t('b02.act.fine')} ▲`, () => D({ type: 'turnFine', deltaTurns: 0.05 }), 160);
          hold('fd', `${t('b02.act.fine')} ▼`, () => D({ type: 'turnFine', deltaTurns: -0.05 }), 160);
          btn('tp', `${t('b02.act.turret')} ▶`, () => D({ type: 'turnTurret', deltaDeg: ctl?.nextTurretDelta(1) ?? 120 }));
          btn('tm', `◀ ${t('b02.act.turret')}`, () => D({ type: 'turnTurret', deltaDeg: ctl?.nextTurretDelta(-1) ?? -120 }));
          btn('tpart', t('b02.act.turretPartial'), () => D({ type: 'turnTurret', deltaDeg: 60 }), 'btn ghost');
          btn('side', `👁 ${t('b02.act.checkSide')}`, () => ctl?.checkSide());
          btn('eye', `🔬 ${w.view.instrument === 'compound' ? t('b02.act.closeEyepiece') : t('b02.act.lookEyepiece')}`, () => D({ type: 'observe', instrument: 'compound', open: w.view.instrument !== 'compound' }), 'btn primary');
          slider('mipd', 'b02.act.ipd', m.ipdMm, (v) => D({ type: 'setInterpupillary', device: 'microscope', valueMm: v }), 48, 75, 0.5, `${m.ipdMm.toFixed(1).replace('.', ',')} mm`);
          slider('mdl', 'b02.act.diopterL', m.leftDiopter, (v) => D({ type: 'setDiopter', device: 'microscope', side: 'left', value: v }), -5, 5, 0.25, m.leftDiopter.toFixed(2).replace('.', ','));
        });
        break;
      }
      case 'membrane': {
        const m = P.membranes[id];
        if (!m) break;
        if (m.installedIn) {
          btn('remove', t('b03.act.removeMembrane'), () => D({ type: 'removeMembrane', cellId: m.installedIn! }), 'btn ghost');
          break;
        }
        if (o.support !== 'sk') btn('soak', t('b03.act.soak'), () => {
          if (held) ctl?.release();
          D({ type: 'setPose', id, pose: { x: SOAK_DISH.x, y: SOAK_DISH.y, z: SOAK_DISH.z, rotationRad: 0 }, support: 'sk' });
        }, 'btn');
        add('memCell', (
          <label className="slider">
            <span>{t('b03.act.cell')}</span>
            <select aria-label={t('b03.act.cell')} value={memCell} onChange={(e) => setMemCell(e.target.value)}>
              {Object.keys(P.cells).map((c) => <option key={c} value={c}>{b03NameOf(w, c)}</option>)}
            </select>
          </label>
        ));
        slider('memOff', 'b03.act.offset', memOffset, setMemOffset, -3, 3, 0.25, `${memOffset.toFixed(2).replace('.', ',')} cm`);
        btn('insert', t('b03.act.insertMembrane'), () => {
          if (o.support !== 'hand') D({ type: 'setPose', id, pose: { ...o.pose }, support: 'hand' });
          if (held) ctl?.cancel();
          D({ type: 'insertMembrane', membraneId: id, cellId: memCell, offsetCm: memOffset });
        }, 'btn primary');
        break;
      }
      case 'twoChamber': {
        const c = P.cells[id];
        if (!c) break;
        if (c.membraneId) {
          btn('clampP', `🔩 ${t('b03.act.clampTighten')}`, () => D({ type: 'turnClamp', cellId: id, deltaTurns: 0.25 }));
          btn('clampM', t('b03.act.clampLoosen'), () => D({ type: 'turnClamp', cellId: id, deltaTurns: -0.25 }), 'btn ghost');
        }
        btn('lid', c.lidClosed ? t('b03.act.lidOpen') : t('b03.act.lidClose'), () => D({ type: 'setLid', cellId: id, closed: !c.lidClosed }), 'btn ghost');
        for (const sd of ['A', 'B'] as const) {
          btn(`read-${sd}`, `📏 ${t('b03.act.readLevel', { s: sd })}`, () => ctl?.read('scale', `${id}:${sd}`));
          btn(`eye-${sd}`, `👁 ${t('b03.act.eyeLevel', { s: sd })}`, () => stage?.camera?.eyeLevel(`${id}:${sd}`), 'btn ghost');
          btn(`look-${sd}`, `🎨 ${t('b03.act.readColor', { s: sd })}`, () => ctl?.read('eye', `${id}:${sd}`), 'btn ghost');
          slider(`mix-${sd}`, `b03.act.mix${sd}`, c.mixing[sd], (v) => D({ type: 'setMixing', cellId: id, side: sd, rate01: v }));
        }
        if (!P.colorimeterZeroed || id === 'c1') btn('colB', `📟 ${t('b03.act.colorimeter')}`, () => ctl?.read('colorimeter', `${id}:B`), 'btn ghost');
        btn('drain', t('b03.act.drain'), () => D({ type: 'drainCell', cellId: id }), 'btn ghost');
        break;
      }
      case 'reagentBottle':
      case 'gradCylinder': {
        if (P.pours[id]) {
          btn('stop', `⏹ ${t('b03.act.stopPour')}`, () => D({ type: 'stopPour', sourceId: id }), 'btn primary');
          break;
        }
        const targets = [...Object.keys(P.cells).flatMap((c) => [`${c}:A`, `${c}:B`]), 'g1', 'g2', ...Object.keys(P.tubes).filter((k) => !P.tubes[k].discarded)].filter((x) => x !== id);
        add('pourTo', (
          <label className="slider">
            <span>{t('b03.act.pourTo')}</span>
            <select aria-label={t('b03.act.pourTo')} value={pourTo} onChange={(e) => setPourTo(e.target.value)}>
              <option value="">{t('nb.choose')}</option>
              {targets.map((x) => <option key={x} value={x}>{b03NameOf(w, x)}</option>)}
            </select>
          </label>
        ));
        slider('tilt', 'b03.act.tilt', pourTilt, setPourTilt, 20, 120, 5, `${pourTilt}°`);
        if (pourTo) btn('pour', `🫗 ${t('b03.act.startPour')}`, () => D({ type: 'startPour', sourceId: id, targetId: pourTo, tiltDeg: pourTilt }), 'btn primary');
        if (o.kind === 'gradCylinder') {
          btn('readCyl', `📏 ${t('b03.act.readCylinder')}`, () => ctl?.read('scale', id));
          btn('eyeCyl', `👁 ${t('b03.act.eyeLevelCyl')}`, () => stage?.camera?.eyeLevel(id), 'btn ghost');
        }
        break;
      }
      case 'pipette': {
        const loaded = P.vessels.pi.volumeMl > (w.params.perm?.pipetteFilmMl ?? 0.02) + 1e-6;
        const pml = ctl?.pipetteMl ?? 2;
        slider('pml', 'b03.act.pipetteVolume', pml, (v) => { if (ctl) ctl.pipetteMl = v; useB03.getState().bump(); }, 0.5, 5, 0.5, `${pml.toFixed(1).replace('.', ',')} mL`);
        const vessels = [...Object.keys(P.cells).flatMap((c) => [`${c}:A`, `${c}:B`]), 'bW', 'bI', 'bE', 'bN', ...Object.keys(P.tubes).filter((k) => !P.tubes[k].discarded)];
        if (!loaded) for (const v of vessels) btn(`asp-${v}`, `⬆ ${t('b03.act.aspirateFrom', { o: b03NameOf(w, v) })}`, () => D({ type: 'aspirate', toolId: 'pi', sourceId: v, volumeMl: pml }), 'btn ghost');
        else for (const v of vessels) btn(`dsp-${v}`, `⬇ ${t('b03.act.dispenseInto', { o: b03NameOf(w, v) })}`, () => D({ type: 'dispense', toolId: 'pi', targetId: v }), 'btn ghost');
        btn('rinse', `🚿 ${t('b03.act.rinse')}`, () => D({ type: 'rinseTool', toolId: 'pi' }));
        break;
      }
      case 'testTube': {
        const tb = P.tubes[id];
        if (!tb || tb.discarded) break;
        if (!tb.label) {
          add('lbl', (
            <label className="slider">
              <span>{t('b03.act.label')}</span>
              <select aria-label={t('b03.act.label')} value={tubeLabel} onChange={(e) => setTubeLabel(e.target.value)}>
                {TUBE_LABELS.map((l) => <option key={l} value={l}>{t(`b03.tubeLabel.${l}`)}</option>)}
              </select>
            </label>
          ));
          btn('doLabel', `🏷 ${t('b03.act.applyLabel')}`, () => D({ type: 'labelTube', tubeId: id, label: tubeLabel }), 'btn primary');
        }
        btn('readTube', `👁 ${t('b03.act.readTube')}`, () => ctl?.read('eye', id));
        btn('dispose', `🗑 ${t('b03.act.disposeTube')}`, () => D({ type: 'disposeTube', tubeId: id }), 'btn ghost');
        break;
      }
      case 'colorimeter':
        btn('zero', `0️⃣ ${t('b03.act.zero')}`, () => D({ type: 'zeroColorimeter' }), 'btn primary');
        btn('readC1', `📟 ${t('b03.act.colorimeterC1')}`, () => ctl?.read('colorimeter', 'c1:B'));
        break;
      case 'thermometer':
        for (const c of Object.keys(P.cells)) btn(`th-${c}`, `🌡 ${t('b03.act.thermoIn', { o: b03NameOf(w, c) })}`, () => ctl?.read('thermo', c));
        break;
      case 'glassBin':
        if (w.shards > 0) btn('shards', `🗑 ${t('b02.act.cleanShards')}`, () => D({ type: 'cleanShards' }), 'btn primary');
        break;
    }
    btn('insp', `🔍 ${t('b02.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  } else {
    btn('close', t('b02.act.closeBench'), () => D({ type: 'closeBench' }), 'btn ghost');
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('b03.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{b03NameOf(w, id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('b02.act.none')}
      </div>
      <div className="row">{buttons}</div>
    </section>
  );
}

export { CLEAN_TRAY, PREP_SPOT, SAMPLE_TRAY, STEREO_BASE };
