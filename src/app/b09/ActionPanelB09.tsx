import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB09 } from './store';
import { describeObject, b09NameOf } from './describe';
import { HoldButton } from './ui';
import type { PlantCommand as CellCommand } from '../../simulation/plant-world/commands';
import { spotsFor } from '../../engine/optical/layout';
import { CLEAN_TRAY, PREP_SPOT, SAMPLE_TRAY, STEREO_BASE } from '../../simulation/optical-world/geometry';
import { PREP2_SPOT } from '../../simulation/cell-world/geometry';

const OFFSETS: Record<string, [number, number]> = { center: [0, 0], edge: [1.1, 0], off: [1.8, 0] };

const A11Y_KEY = 'b09.a11yControls';
const readA11y = () => {
  try {
    return localStorage.getItem(A11Y_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Panel de acciones de B09 (§14.4): alternativa accesible a cada gesto. Despacha EXACTAMENTE los mismos comandos del
 * dominio que el controlador: apoyos, corte con bisturí (espesor y largo), raspado con espátula (distancia y presión),
 * hisopado y extendido, residuos, pinza, goteros de agua y colorantes, papeles, cubreobjetos con inclinación y
 * velocidad, todos los mandos de los dos instrumentos, la caja y el cierre. No hay «enfocar» ni «preparar» automáticos.
 * Los mandos de los instrumentos se operan con el ratón sobre las piezas; aquí quedan plegados bajo «Mandos
 * accesibles» (teclado, lector de pantalla, dificultades motoras), con la preferencia recordada.
 */
export function ActionPanelB09() {
  const { t } = useTranslation();
  useB09((s) => s.version);
  const rt = useB09((s) => s.runtime);
  const stage = useB09((s) => s.stage);
  const sel = useB09((s) => s.selected);
  const held = useB09((s) => s.held);
  const dispatch = useB09((s) => s.dispatch);
  const toast = useB09((s) => s.toast);
  const mode = useB09((s) => s.settings.mode);
  const demo = useB09((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
  const [pos, setPos] = useState<'center' | 'edge' | 'off'>('center');
  const [force, setForce] = useState(0.5);
  const [pressure, setPressure] = useState(0.4);
  const [thick, setThick] = useState(0.15);
  const [length, setLength] = useState(0.8);
  const [dist, setDist] = useState(1.2);
  const [swabS, setSwabS] = useState(4);
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
    add('a11y', <button className="btn ghost" aria-expanded={a11y} onClick={toggleA11y}>{a11y ? '▾' : '▸'} {t('b09.act.a11yControls')}</button>);
    if (a11y) fn();
  };
  const w = rt.world;
  const ctl = stage?.controller;
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
      const k = `b09.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('b09.cmd.FAILED'));
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
  const prepSlide = Object.values(w.objects).find((x) => x.support === 'prep')?.id ?? Object.values(w.objects).find((x) => x.support === 'prep2')?.id ?? null;
  const cell = w.cell;
  const sources = Object.keys(cell.sources).filter((k) => w.objects[k]?.kind === 'tissueSource');
  const posSel = () => add('pos', (
    <label className="slider">
      <span>{t('b09.act.where')}</span>
      <select aria-label={t('b09.act.where')} value={pos} onChange={(e) => setPos(e.target.value as typeof pos)}>
        {Object.keys(OFFSETS).map((k) => <option key={k} value={k}>{t(`b09.act.pos_${k}`)}</option>)}
      </select>
    </label>
  ));
  const [dx, dy] = OFFSETS[pos];

  if (id && o) {
    if (o.movable && !held && o.support !== 'fc') btn('take', t('b09.act.take'), () => ctl?.beginDrag(id, true), 'btn ghost');
    if (held) {
      btn('drop', t('b09.act.release'), () => ctl?.release(), 'btn primary');
      hold('up', `▲ ${t('b09.act.up')}`, () => ctl?.nudgeHeight(0.5), 90);
      hold('down', `▼ ${t('b09.act.down')}`, () => ctl?.nudgeHeight(-0.5), 90);
      btn('cancel', t('b09.act.cancel'), () => ctl?.cancel(), 'btn ghost');
    }
    // ── Apoyos con nombre (como soltar en ese lugar) ──
    if (o.movable && (o.kind === 'slide' || o.kind === 'fixedSlide' || o.kind === 'leafSample' || o.kind === 'insectSample')) {
      // Apoyos de B01 más el área de preparación animal (solo portaobjetos limpios).
      const extra = o.kind === 'slide' ? [{ id: 'prep2', x: PREP2_SPOT.x, y: PREP2_SPOT.y, z: PREP2_SPOT.z, r: 7 }] : [];
      for (const s of [...spotsFor(w, o.kind), ...extra]) {
        if (s.id === o.support || s.id.startsWith('case:') && s.id.slice(5) !== w.slideCase.home[id]) continue;
        btn(`spot-${s.id}`, t(`b09.spot.${s.id.startsWith('case:') ? 'homeSlot' : s.id}`), () => {
          if (held) ctl?.release();
          const r = D({ type: 'setPose', id, pose: { x: s.x, y: s.y, z: s.z, rotationRad: 0 }, support: s.id });
          if (!r.ok) ctl?.layOnBench(id, o.pose.x, o.pose.y);
        }, 'btn ghost');
      }
      if (o.support !== 'bench') btn('bench', t('b09.act.toBench'), () => ctl?.layOnBench(id, o.pose.x, o.pose.y - 6), 'btn ghost');
    }
    if (o.kind === 'slide' || o.kind === 'fixedSlide') btn('flip', t('b09.act.flip'), () => D({ type: 'flipSlide', slideId: id }), 'btn ghost');
    switch (o.kind) {
      case 'forceps': {
        const h = w.forceps.holding;
        add('pr', (
          <label className="check"><input type="checkbox" checked={pressure > 0.6} onChange={(e) => setPressure(e.target.checked ? 0.9 : 0.3)} /> {t('b09.act.squeezeHard')}</label>
        ));
        if (cell.held.fc) {
          posSel();
          if (prepSlide) btn('placeTissue', t('b09.act.placeOnSlide'), () => D({ type: 'placeSpecimen', toolId: 'fc', targetId: prepSlide, dxCm: dx, dyCm: dy }), 'btn primary');
        } else if (!h) {
          btn('leaf', t('b09.act.pickLeaf'), () => D({ type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' }));
          slider('peelMm', 'b09.act.thickness', thick, setThick, 0.05, 1.5, 0.05, `${thick.toFixed(2).replace('.', ',')} mm`);
          btn('peel', t('b09.act.peel'), () => D({ type: 'peelEpidermis', sourceId: 'tra', toolId: 'fc', thicknessMm: thick, lengthCm: 0.8 }));
          if (cell.board) btn('board', t('b09.act.pickFromBoard', { kind: t(`b09.specimen.${cell.board.kind}`) }), () => D({ type: 'pickSpecimen', toolId: 'fc', sourceId: 'board' }), 'btn primary');
          const cv = Object.keys(w.covers).find((c) => w.covers[c].state === 'box');
          if (cv) btn('cover', t('b09.act.pickCover'), () => D({ type: 'grabCover', coverId: cv, toolId: 'fc' }));
          for (const sid of Object.keys(w.stereoSamples)) btn(`pick-${sid}`, t('b09.act.pickSample', { o: b09NameOf(w, sid) }), () => D({ type: 'pickSpecimen', toolId: 'fc', sourceId: sid, pressure01: pressure }));
          if (prepSlide && w.mounts[prepSlide]?.coverId) btn('lift', t('b09.act.liftCover'), () => D({ type: 'liftCover', slideId: prepSlide, toolId: 'fc' }), 'btn ghost');
          btn('clean', t('b09.act.cleanForceps'), () => D({ type: 'wipe', targetId: 'fc', toolId: 'lp' }), 'btn ghost');
        } else if (h.kind === 'specimen') {
          posSel();
          if (prepSlide) btn('place', t('b09.act.placeOnSlide'), () => D({ type: 'placeSpecimen', toolId: 'fc', targetId: prepSlide, dxCm: dx, dyCm: dy }), 'btn primary');
        } else if (h.kind === 'cover') {
          const c = w.covers[h.coverId];
          slider('tilt', 'b09.act.tilt', c.tiltDeg, (v) => D({ type: 'setCoverTilt', coverId: h.coverId, angleDeg: v }), 0, 90, 5, `${Math.round(c.tiltDeg)}°`);
          if (prepSlide) {
            btn('lowerSlow', t('b09.act.lowerSlow'), () => D({ type: 'lowerCover', coverId: h.coverId, slideId: prepSlide, speedCmS: 0.4, dxCm: 0, dyCm: 0 }), 'btn primary');
            btn('lowerFast', t('b09.act.lowerFast'), () => D({ type: 'lowerCover', coverId: h.coverId, slideId: prepSlide, speedCmS: 2.5, dxCm: 0, dyCm: 0 }));
          }
        } else {
          btn('toBase', t('b09.act.sampleToBase'), () => D({ type: 'placeSpecimen', toolId: 'fc', targetId: 'stereoBase', dxCm: pos === 'center' ? 0 : pos === 'edge' ? 1 : 2.2, dyCm: 0 }), 'btn primary');
          btn('toTray', t('b09.act.sampleToTray'), () => D({ type: 'placeSpecimen', toolId: 'fc', targetId: 'sampleTray', dxCm: h.sampleId === 'leaf1' ? -3 : 3, dyCm: 0 }));
          posSel();
        }
        break;
      }
      case 'dropperBottle':
        if (prepSlide) {
          posSel();
          slider('force', 'b09.act.force', force, setForce);
          btn('squeeze', `💧 ${t('b09.act.squeeze')}`, () => D({ type: 'squeezeDropper', dispenserId: id, targetId: prepSlide, force01: force, dxCm: dx, dyCm: dy }), 'btn primary');
        }
        for (const fx of Object.keys(w.slides).filter((s) => w.slides[s].kind === 'fixed' && w.objects[s].support === 'stage')) btn(`dropfx-${fx}`, t('b09.act.dropOnFixed'), () => D({ type: 'squeezeDropper', dispenserId: id, targetId: fx, force01: force, dxCm: 0, dyCm: 0 }), 'btn ghost');
        break;
      case 'scalpel':
        // Plano, grosor, región y presión se eligen en la mesa de corte; aquí solo el resto del gesto.
        if (cell.toolResidue.sc) btn('wipeSc', t('b09.act.wipeTool'), () => D({ type: 'wipe', targetId: 'sc', toolId: 'lp' }), 'btn ghost');
        break;
      case 'spatula':
        slider('dist', 'b09.act.scrapeDist', dist, setDist, 0.2, 2.5, 0.1, `${dist.toFixed(1).replace('.', ',')} cm`);
        slider('pressure', 'b09.act.pressure', pressure, setPressure);
        if (!cell.held.sp) for (const sid of sources) btn(`scr-${sid}`, t('b09.act.scrapeFrom', { o: b09NameOf(w, sid) }), () => D({ type: 'scrape', sourceId: sid, toolId: 'sp', distanceCm: dist, pressure01: pressure }));
        if (cell.held.sp && prepSlide) {
          posSel();
          btn('placeSp', t('b09.act.placeOnSlide'), () => D({ type: 'placeSpecimen', toolId: 'sp', targetId: prepSlide, dxCm: dx, dyCm: dy }), 'btn primary');
        }
        if (cell.toolResidue.sp) btn('wipeSp', t('b09.act.wipeTool'), () => D({ type: 'wipe', targetId: 'sp', toolId: 'lp' }), 'btn ghost');
        break;
      case 'swab': {
        const st = cell.swabs[id]?.state;
        if (st === 'box') {
          slider('swabS', 'b09.act.swabTime', swabS, setSwabS, 0.5, 8, 0.5, `${swabS.toFixed(1).replace('.', ',')} s`);
          slider('pressure', 'b09.act.pressure', pressure, setPressure);
          btn('swab', t('b09.act.swabCheek'), () => D({ type: 'swab', swabId: id, sourceId: 'bucc', durationS: swabS, pressure01: pressure }), 'btn primary');
        }
        if (st === 'loaded' && prepSlide) {
          slider('len', 'b09.act.smearLength', length, setLength, 0.2, 2.5, 0.1, `${length.toFixed(1).replace('.', ',')} cm`);
          slider('pressure', 'b09.act.pressure', pressure, setPressure);
          posSel();
          btn('smear', t('b09.act.smear'), () => D({ type: 'smear', swabId: id, slideId: prepSlide, lengthCm: length, pressure01: pressure, dxCm: dx, dyCm: dy }), 'btn primary');
        }
        if (st && st !== 'box') {
          btn('bio', t('b09.act.toBioWaste'), () => D({ type: 'dispose', objectId: id, containerId: 'bioWaste' }));
          btn('trash', t('b09.act.toTrash'), () => D({ type: 'dispose', objectId: id, containerId: 'trashBin' }), 'btn ghost');
        }
        break;
      }
      case 'paper':
        if (prepSlide) {
          btn('edge', t('b09.act.wipeEdge'), () => D({ type: 'wipe', targetId: prepSlide, toolId: 'pp', dxCm: 1.1, dyCm: 0 }), 'btn primary');
          btn('center', t('b09.act.wipeCenter'), () => D({ type: 'wipe', targetId: prepSlide, toolId: 'pp', dxCm: 0, dyCm: 0 }), 'btn ghost');
        }
        if (w.benchSpillMl > 0.005) btn('spill', t('b09.act.wipeSpill'), () => D({ type: 'wipe', targetId: 'bench', toolId: 'pp' }));
        break;
      case 'lensPaper':
        if (prepSlide) btn('slide', t('b09.act.cleanSlide'), () => D({ type: 'wipe', targetId: prepSlide, toolId: 'lp' }));
        for (const tl of ['sc', 'sp', 'fc'] as const) if (cell.toolResidue[tl] || (tl === 'fc' && w.forceps.dirty01 > 0.3)) btn(`wipe-${tl}`, t('b09.act.wipeToolNamed', { o: b09NameOf(w, tl) }), () => D({ type: 'wipe', targetId: tl, toolId: 'lp' }));
        btn('lens', t('b09.act.cleanLens'), () => D({ type: 'wipe', targetId: 'mic:lens', toolId: 'lp' }));
        break;
      case 'towel':
        btn('lens', t('b09.act.cleanLensTowel'), () => D({ type: 'wipe', targetId: 'mic:lens', toolId: 'tw' }), 'btn ghost');
        break;
      case 'microscope': {
        const m = w.microscope;
        controls(() => {
          btn('power', `⏻ ${m.power ? t('b09.act.powerOff') : t('b09.act.powerOn')}`, () => D({ type: 'setPower', device: 'microscope', on: !m.power }));
          btn('clip', m.clipOpen ? t('b09.act.clipClose') : t('b09.act.clipOpen'), () => D({ type: 'openClip', open: !m.clipOpen }));
          slider('light', 'b09.act.light', m.light01, (v) => D({ type: 'setIllumination', device: 'microscope', value01: v }));
          slider('diaph', 'b09.act.diaphragm', m.diaphragm01, (v) => D({ type: 'setDiaphragm', value01: v }));
          slider('cond', 'b09.act.condenser', m.condenser01, (v) => D({ type: 'setCondenser', value01: v }));
          hold('xm', 'X −', () => D({ type: 'setStageXY', xMm: m.stageXmm - 0.2, yMm: m.stageYmm }));
          hold('xp', 'X +', () => D({ type: 'setStageXY', xMm: m.stageXmm + 0.2, yMm: m.stageYmm }));
          hold('ym', 'Y −', () => D({ type: 'setStageXY', xMm: m.stageXmm, yMm: m.stageYmm - 0.2 }));
          hold('yp', 'Y +', () => D({ type: 'setStageXY', xMm: m.stageXmm, yMm: m.stageYmm + 0.2 }));
          hold('cu', `${t('b09.act.coarse')} ▲`, () => D({ type: 'turnCoarse', deltaTurns: 0.1 }), 160);
          hold('cd', `${t('b09.act.coarse')} ▼`, () => D({ type: 'turnCoarse', deltaTurns: -0.1 }), 160);
          hold('fu', `${t('b09.act.fine')} ▲`, () => D({ type: 'turnFine', deltaTurns: 0.05 }), 160);
          hold('fd', `${t('b09.act.fine')} ▼`, () => D({ type: 'turnFine', deltaTurns: -0.05 }), 160);
          btn('tp', `${t('b09.act.turret')} ▶`, () => D({ type: 'turnTurret', deltaDeg: ctl?.nextTurretDelta(1) ?? 120 }));
          btn('tm', `◀ ${t('b09.act.turret')}`, () => D({ type: 'turnTurret', deltaDeg: ctl?.nextTurretDelta(-1) ?? -120 }));
          btn('tpart', t('b09.act.turretPartial'), () => D({ type: 'turnTurret', deltaDeg: 60 }), 'btn ghost');
          btn('side', `👁 ${t('b09.act.checkSide')}`, () => ctl?.checkSide());
          btn('eye', `🔬 ${w.view.instrument === 'compound' ? t('b09.act.closeEyepiece') : t('b09.act.lookEyepiece')}`, () => D({ type: 'observe', instrument: 'compound', open: w.view.instrument !== 'compound' }), 'btn primary');
          slider('mipd', 'b09.act.ipd', m.ipdMm, (v) => D({ type: 'setInterpupillary', device: 'microscope', valueMm: v }), 48, 75, 0.5, `${m.ipdMm.toFixed(1).replace('.', ',')} mm`);
          slider('mdl', 'b09.act.diopterL', m.leftDiopter, (v) => D({ type: 'setDiopter', device: 'microscope', side: 'left', value: v }), -5, 5, 0.25, m.leftDiopter.toFixed(2).replace('.', ','));
        });
        break;
      }
      case 'stereo': {
        const s = w.stereo;
        controls(() => {
          btn('power', `⏻ ${s.power ? t('b09.act.powerOff') : t('b09.act.powerOn')}`, () => D({ type: 'setPower', device: 'stereo', on: !s.power }));
          slider('inc', 'b09.act.incident', s.incident01, (v) => D({ type: 'setIllumination', device: 'stereo-incident', value01: v }));
          slider('tra', 'b09.act.transmitted', s.transmitted01, (v) => D({ type: 'setIllumination', device: 'stereo-transmitted', value01: v }));
          slider('zoom', 'b09.act.zoom', s.zoomX, (v) => D({ type: 'setStereoZoom', zoomX: v }), 0.7, 4.5, 0.1, `${s.zoomX.toFixed(1).replace('.', ',')}X`);
          hold('fu', `${t('b09.act.focus')} ▲`, () => D({ type: 'setStereoFocus', deltaTurns: 0.25 }), 160);
          hold('fd', `${t('b09.act.focus')} ▼`, () => D({ type: 'setStereoFocus', deltaTurns: -0.25 }), 160);
          hold('hu', `${t('b09.act.head')} ▲`, () => D({ type: 'setStereoHead', zMm: s.headZmm + 1 }), 160);
          hold('hd', `${t('b09.act.head')} ▼`, () => D({ type: 'setStereoHead', zMm: s.headZmm - 1 }), 160);
          slider('ipd', 'b09.act.ipd', s.ipdMm, (v) => D({ type: 'setInterpupillary', valueMm: v }), 50, 76, 0.5, `${s.ipdMm.toFixed(1).replace('.', ',')} mm`);
          slider('dl', 'b09.act.diopterL', s.leftDiopter, (v) => D({ type: 'setDiopter', side: 'left', value: v }), -5, 5, 0.25, s.leftDiopter.toFixed(2).replace('.', ','));
          slider('dr', 'b09.act.diopterR', s.rightDiopter, (v) => D({ type: 'setDiopter', side: 'right', value: v }), -5, 5, 0.25, s.rightDiopter.toFixed(2).replace('.', ','));
          btn('eye', `🔍 ${w.view.instrument === 'stereo' ? t('b09.act.closeEyepiece') : t('b09.act.lookEyepiece')}`, () => D({ type: 'observe', instrument: 'stereo', open: w.view.instrument !== 'stereo' }), 'btn primary');
        });
        break;
      }
      case 'slideCase':
        btn('lid', w.slideCase.open ? t('b09.act.caseClose') : t('b09.act.caseOpen'), () => D({ type: 'openSlideCase', open: !w.slideCase.open }), 'btn primary');
        break;
      case 'glassBin':
        if (w.shards > 0) btn('shards', `🗑 ${t('b09.act.cleanShards')}`, () => D({ type: 'cleanShards' }), 'btn primary');
        break;
      case 'oilBottle': {
        const onStage = w.microscope.slideOnStage;
        if (onStage) btn('oil', `🫗 ${t('b09.act.addOil')}`, () => D({ type: 'addImmersionOil', slideId: onStage, drops: 1 }), 'btn primary');
        else add('oilHint', <span className="hint">{t('b09.act.oilNeedsSlide')}</span>);
        break;
      }
      case 'wrightBottle':
        if (w.div.wright.wr1) btn('wright', `💧 ${t(id === 'buf' ? 'b09.act.addBuffer' : 'b09.act.addWright')}`, () => D({ type: 'squeezeDropper', dispenserId: id, targetId: 'wr1', force01: 0.5, dxCm: 0, dyCm: 0 }), 'btn primary');
        break;
      case 'tissue':
        btn('lens', t('b09.act.cleanLensTissue'), () => D({ type: 'wipe', targetId: 'mic:lens', toolId: 'tw' }), 'btn ghost');
        if (w.div.micWet) btn('dry', t('b09.act.dryMic'), () => D({ type: 'wipe', targetId: 'mic', toolId: 'tw' }), 'btn ghost');
        break;
      case 'culturePlate':
        btn('open', t('b09.act.openCulture'), () => D({ type: 'openCulture', id }), 'btn ghost');
        break;
      case 'lancetBox':
        btn('lancet', t('b09.act.useLancet'), () => D({ type: 'useLancet' }), 'btn ghost');
        break;
      case 'sampleCards':
        btn('cards', t('b09.act.openCards'), () => useB09.setState({ notebookOpen: true, notebookTab: 'pre' }), 'btn primary');
        break;
      case 'plantPot':
        add('potHint', <span className="hint">{t('b09.act.potHint')}</span>);
        break;
    }
    // Portaobjetos propio: etiqueta (identidad del protista) y corrimiento del cubreobjetos.
    if (o.kind === 'slide' && w.slides[id]?.kind === 'blank') {
      add('label', (
        <label className="slider">
          <span>{t('b09.act.label')}</span>
          <select aria-label={t('b09.act.label')} value={w.div.labels[id] ?? ''} onChange={(e) => e.target.value && D({ type: 'labelSlide', slideId: id, label: e.target.value })}>
            <option value="">{t('nb.choose')}</option>
            {(['paramecium', 'euglena', 'tradescantia', 'elodea', 'buccal'] as const).map((k) => <option key={k} value={k}>{t(`b09.specimen.${k}`)}</option>)}
          </select>
        </label>
      ));
      if (w.mounts[id]?.coverId) btn('shift', t('b09.act.shiftCover'), () => D({ type: 'shiftCover', slideId: id, dxCm: 0.4 }), 'btn ghost');
    }
    if (id === 'wr1' && w.div.wright.wr1) btn('rinse', t('b09.act.rinseWright'), () => D({ type: 'squeezeDropper', dispenserId: 'dw', targetId: 'wr1', force01: 0.5, dxCm: 0, dyCm: 0 }), 'btn ghost');
    btn('insp', `🔍 ${t('b09.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  } else {
    btn('close', t('b09.act.closeBench'), () => D({ type: 'closeBench' }), 'btn ghost');
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('b09.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{b09NameOf(w, id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('b09.act.none')}
      </div>
      <div className="row">{buttons}</div>
    </section>
  );
}

export { CLEAN_TRAY, PREP_SPOT, SAMPLE_TRAY, STEREO_BASE };
