import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB01 } from './store';
import { describeObject, b01NameOf } from './describe';
import { HoldButton } from './ui';
import type { B01Command } from '../../simulation/optical-world/commands';
import { spotsFor } from '../../engine/optical/layout';
import { CLEAN_TRAY, PREP_SPOT, SAMPLE_TRAY, STEREO_BASE } from '../../simulation/optical-world/geometry';

const OFFSETS: Record<string, [number, number]> = { center: [0, 0], edge: [1.1, 0], off: [1.8, 0] };

/**
 * Panel de acciones de B01 (§14.1): alternativa accesible a cada gesto. Despacha EXACTAMENTE los mismos comandos del
 * dominio que el controlador: apoyos, pinza, gotero, bisturí, papeles, cubreobjetos con inclinación y velocidad, todos
 * los mandos de los dos instrumentos, la caja y el cierre. No hay «enfocar» ni «preparar» automáticos.
 */
export function ActionPanelB01() {
  const { t } = useTranslation();
  useB01((s) => s.version);
  const rt = useB01((s) => s.runtime);
  const stage = useB01((s) => s.stage);
  const sel = useB01((s) => s.selected);
  const held = useB01((s) => s.held);
  const dispatch = useB01((s) => s.dispatch);
  const toast = useB01((s) => s.toast);
  const mode = useB01((s) => s.settings.mode);
  const demo = useB01((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
  const [pos, setPos] = useState<'center' | 'edge' | 'off'>('center');
  const [force, setForce] = useState(0.5);
  const [keep, setKeep] = useState(0.45);
  const [pressure, setPressure] = useState(0.4);
  if (!rt) return null;
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
  const D = (c: B01Command) => {
    const r = dispatch(c);
    if (!r.ok && r.code) {
      const k = `b01.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('b01.cmd.FAILED'));
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
  const prepSlide = Object.values(w.objects).find((x) => x.support === 'prep')?.id ?? null;
  const posSel = () => add('pos', (
    <label className="slider">
      <span>{t('b01.act.where')}</span>
      <select aria-label={t('b01.act.where')} value={pos} onChange={(e) => setPos(e.target.value as typeof pos)}>
        {Object.keys(OFFSETS).map((k) => <option key={k} value={k}>{t(`b01.act.pos_${k}`)}</option>)}
      </select>
    </label>
  ));
  const [dx, dy] = OFFSETS[pos];

  if (id && o) {
    if (o.movable && !held && o.support !== 'fc') btn('take', t('b01.act.take'), () => ctl?.beginDrag(id, true), 'btn ghost');
    if (held) {
      btn('drop', t('b01.act.release'), () => ctl?.release(), 'btn primary');
      hold('up', `▲ ${t('b01.act.up')}`, () => ctl?.nudgeHeight(0.5), 90);
      hold('down', `▼ ${t('b01.act.down')}`, () => ctl?.nudgeHeight(-0.5), 90);
      btn('cancel', t('b01.act.cancel'), () => ctl?.cancel(), 'btn ghost');
    }
    // ── Apoyos con nombre (como soltar en ese lugar) ──
    if (o.movable && (o.kind === 'slide' || o.kind === 'fixedSlide' || o.kind === 'leafSample' || o.kind === 'insectSample')) {
      for (const s of spotsFor(w, o.kind)) {
        if (s.id === o.support || s.id.startsWith('case:') && s.id.slice(5) !== w.slideCase.home[id]) continue;
        btn(`spot-${s.id}`, t(`b01.spot.${s.id.startsWith('case:') ? 'homeSlot' : s.id}`), () => {
          if (held) ctl?.release();
          const r = D({ type: 'setPose', id, pose: { x: s.x, y: s.y, z: s.z, rotationRad: 0 }, support: s.id });
          if (!r.ok) ctl?.layOnBench(id, o.pose.x, o.pose.y);
        }, 'btn ghost');
      }
      if (o.support !== 'bench') btn('bench', t('b01.act.toBench'), () => ctl?.layOnBench(id, o.pose.x, o.pose.y - 6), 'btn ghost');
    }
    if (o.kind === 'slide' || o.kind === 'fixedSlide') btn('flip', t('b01.act.flip'), () => D({ type: 'flipSlide', slideId: id }), 'btn ghost');
    switch (o.kind) {
      case 'forceps': {
        const h = w.forceps.holding;
        add('pr', (
          <label className="check"><input type="checkbox" checked={pressure > 0.6} onChange={(e) => setPressure(e.target.checked ? 0.9 : 0.3)} /> {t('b01.act.squeezeHard')}</label>
        ));
        if (!h) {
          btn('leaf', t('b01.act.pickLeaf'), () => D({ type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' }));
          const cv = Object.keys(w.covers).find((c) => w.covers[c].state === 'box');
          if (cv) btn('cover', t('b01.act.pickCover'), () => D({ type: 'grabCover', coverId: cv, toolId: 'fc' }));
          for (const sid of Object.keys(w.stereoSamples)) btn(`pick-${sid}`, t('b01.act.pickSample', { o: b01NameOf(w, sid) }), () => D({ type: 'pickSpecimen', toolId: 'fc', sourceId: sid, pressure01: pressure }));
          if (prepSlide && w.mounts[prepSlide]?.coverId) btn('lift', t('b01.act.liftCover'), () => D({ type: 'liftCover', slideId: prepSlide, toolId: 'fc' }), 'btn ghost');
          btn('clean', t('b01.act.cleanForceps'), () => D({ type: 'wipe', targetId: 'fc', toolId: 'lp' }), 'btn ghost');
        } else if (h.kind === 'specimen') {
          posSel();
          if (prepSlide) btn('place', t('b01.act.placeOnSlide'), () => D({ type: 'placeSpecimen', toolId: 'fc', targetId: prepSlide, dxCm: dx, dyCm: dy }), 'btn primary');
        } else if (h.kind === 'cover') {
          const c = w.covers[h.coverId];
          slider('tilt', 'b01.act.tilt', c.tiltDeg, (v) => D({ type: 'setCoverTilt', coverId: h.coverId, angleDeg: v }), 0, 90, 5, `${Math.round(c.tiltDeg)}°`);
          if (prepSlide) {
            btn('lowerSlow', t('b01.act.lowerSlow'), () => D({ type: 'lowerCover', coverId: h.coverId, slideId: prepSlide, speedCmS: 0.4, dxCm: 0, dyCm: 0 }), 'btn primary');
            btn('lowerFast', t('b01.act.lowerFast'), () => D({ type: 'lowerCover', coverId: h.coverId, slideId: prepSlide, speedCmS: 2.5, dxCm: 0, dyCm: 0 }));
          }
        } else {
          btn('toBase', t('b01.act.sampleToBase'), () => D({ type: 'placeSpecimen', toolId: 'fc', targetId: 'stereoBase', dxCm: pos === 'center' ? 0 : pos === 'edge' ? 1 : 2.2, dyCm: 0 }), 'btn primary');
          btn('toTray', t('b01.act.sampleToTray'), () => D({ type: 'placeSpecimen', toolId: 'fc', targetId: 'sampleTray', dxCm: h.sampleId === 'leaf1' ? -3 : 3, dyCm: 0 }));
          posSel();
        }
        break;
      }
      case 'dropperBottle':
        if (prepSlide) {
          posSel();
          slider('force', 'b01.act.force', force, setForce);
          btn('drop', `💧 ${t('b01.act.squeeze')}`, () => D({ type: 'squeezeDropper', dispenserId: id, targetId: prepSlide, force01: force, dxCm: dx, dyCm: dy }), 'btn primary');
        }
        for (const fx of Object.keys(w.slides).filter((s) => w.slides[s].kind === 'fixed' && w.objects[s].support === 'stage')) btn(`dropfx-${fx}`, t('b01.act.dropOnFixed'), () => D({ type: 'squeezeDropper', dispenserId: id, targetId: fx, force01: force, dxCm: 0, dyCm: 0 }), 'btn ghost');
        break;
      case 'scalpel':
        if (prepSlide && w.mounts[prepSlide]?.specimenId) {
          slider('keep', 'b01.act.keep', keep, setKeep, 0.1, 1, 0.05);
          slider('pressure', 'b01.act.pressure', pressure, setPressure);
          btn('cut', `✂ ${t('b01.act.cut')}`, () => D({ type: 'cutSpecimen', slideId: prepSlide, toolId: 'sc', keepFraction: keep, pressure01: pressure }), 'btn primary');
        }
        break;
      case 'paper':
        if (prepSlide) {
          btn('edge', t('b01.act.wipeEdge'), () => D({ type: 'wipe', targetId: prepSlide, toolId: 'pp', dxCm: 1.1, dyCm: 0 }), 'btn primary');
          btn('center', t('b01.act.wipeCenter'), () => D({ type: 'wipe', targetId: prepSlide, toolId: 'pp', dxCm: 0, dyCm: 0 }), 'btn ghost');
        }
        if (w.benchSpillMl > 0.005) btn('spill', t('b01.act.wipeSpill'), () => D({ type: 'wipe', targetId: 'bench', toolId: 'pp' }));
        break;
      case 'lensPaper':
        if (prepSlide) btn('slide', t('b01.act.cleanSlide'), () => D({ type: 'wipe', targetId: prepSlide, toolId: 'lp' }));
        btn('lens', t('b01.act.cleanLens'), () => D({ type: 'wipe', targetId: 'mic:lens', toolId: 'lp' }));
        break;
      case 'towel':
        btn('lens', t('b01.act.cleanLensTowel'), () => D({ type: 'wipe', targetId: 'mic:lens', toolId: 'tw' }), 'btn ghost');
        break;
      case 'microscope': {
        const m = w.microscope;
        btn('power', `⏻ ${m.power ? t('b01.act.powerOff') : t('b01.act.powerOn')}`, () => D({ type: 'setPower', device: 'microscope', on: !m.power }));
        btn('clip', m.clipOpen ? t('b01.act.clipClose') : t('b01.act.clipOpen'), () => D({ type: 'openClip', open: !m.clipOpen }));
        slider('light', 'b01.act.light', m.light01, (v) => D({ type: 'setIllumination', device: 'microscope', value01: v }));
        slider('diaph', 'b01.act.diaphragm', m.diaphragm01, (v) => D({ type: 'setDiaphragm', value01: v }));
        slider('cond', 'b01.act.condenser', m.condenser01, (v) => D({ type: 'setCondenser', value01: v }));
        hold('xm', 'X −', () => D({ type: 'setStageXY', xMm: m.stageXmm - 0.2, yMm: m.stageYmm }));
        hold('xp', 'X +', () => D({ type: 'setStageXY', xMm: m.stageXmm + 0.2, yMm: m.stageYmm }));
        hold('ym', 'Y −', () => D({ type: 'setStageXY', xMm: m.stageXmm, yMm: m.stageYmm - 0.2 }));
        hold('yp', 'Y +', () => D({ type: 'setStageXY', xMm: m.stageXmm, yMm: m.stageYmm + 0.2 }));
        hold('cu', `${t('b01.act.coarse')} ▲`, () => D({ type: 'turnCoarse', deltaTurns: 0.1 }), 160);
        hold('cd', `${t('b01.act.coarse')} ▼`, () => D({ type: 'turnCoarse', deltaTurns: -0.1 }), 160);
        hold('fu', `${t('b01.act.fine')} ▲`, () => D({ type: 'turnFine', deltaTurns: 0.05 }), 160);
        hold('fd', `${t('b01.act.fine')} ▼`, () => D({ type: 'turnFine', deltaTurns: -0.05 }), 160);
        btn('tp', `${t('b01.act.turret')} ▶`, () => D({ type: 'turnTurret', deltaDeg: ctl?.nextTurretDelta(1) ?? 120 }));
        btn('tm', `◀ ${t('b01.act.turret')}`, () => D({ type: 'turnTurret', deltaDeg: ctl?.nextTurretDelta(-1) ?? -120 }));
        btn('tpart', t('b01.act.turretPartial'), () => D({ type: 'turnTurret', deltaDeg: 60 }), 'btn ghost');
        btn('side', `👁 ${t('b01.act.checkSide')}`, () => ctl?.checkSide());
        btn('eye', `🔬 ${w.view.instrument === 'compound' ? t('b01.act.closeEyepiece') : t('b01.act.lookEyepiece')}`, () => D({ type: 'observe', instrument: 'compound', open: w.view.instrument !== 'compound' }), 'btn primary');
        break;
      }
      case 'stereo': {
        const s = w.stereo;
        btn('power', `⏻ ${s.power ? t('b01.act.powerOff') : t('b01.act.powerOn')}`, () => D({ type: 'setPower', device: 'stereo', on: !s.power }));
        slider('inc', 'b01.act.incident', s.incident01, (v) => D({ type: 'setIllumination', device: 'stereo-incident', value01: v }));
        slider('tra', 'b01.act.transmitted', s.transmitted01, (v) => D({ type: 'setIllumination', device: 'stereo-transmitted', value01: v }));
        slider('zoom', 'b01.act.zoom', s.zoomX, (v) => D({ type: 'setStereoZoom', zoomX: v }), 0.7, 4.5, 0.1, `${s.zoomX.toFixed(1).replace('.', ',')}X`);
        hold('fu', `${t('b01.act.focus')} ▲`, () => D({ type: 'setStereoFocus', deltaTurns: 0.25 }), 160);
        hold('fd', `${t('b01.act.focus')} ▼`, () => D({ type: 'setStereoFocus', deltaTurns: -0.25 }), 160);
        hold('hu', `${t('b01.act.head')} ▲`, () => D({ type: 'setStereoHead', zMm: s.headZmm + 1 }), 160);
        hold('hd', `${t('b01.act.head')} ▼`, () => D({ type: 'setStereoHead', zMm: s.headZmm - 1 }), 160);
        slider('ipd', 'b01.act.ipd', s.ipdMm, (v) => D({ type: 'setInterpupillary', valueMm: v }), 50, 76, 0.5, `${s.ipdMm.toFixed(1).replace('.', ',')} mm`);
        slider('dl', 'b01.act.diopterL', s.leftDiopter, (v) => D({ type: 'setDiopter', side: 'left', value: v }), -5, 5, 0.25, s.leftDiopter.toFixed(2).replace('.', ','));
        slider('dr', 'b01.act.diopterR', s.rightDiopter, (v) => D({ type: 'setDiopter', side: 'right', value: v }), -5, 5, 0.25, s.rightDiopter.toFixed(2).replace('.', ','));
        btn('eye', `🔍 ${w.view.instrument === 'stereo' ? t('b01.act.closeEyepiece') : t('b01.act.lookEyepiece')}`, () => D({ type: 'observe', instrument: 'stereo', open: w.view.instrument !== 'stereo' }), 'btn primary');
        break;
      }
      case 'slideCase':
        btn('lid', w.slideCase.open ? t('b01.act.caseClose') : t('b01.act.caseOpen'), () => D({ type: 'openSlideCase', open: !w.slideCase.open }), 'btn primary');
        break;
      case 'glassBin':
        if (w.shards > 0) btn('shards', `🗑 ${t('b01.act.cleanShards')}`, () => D({ type: 'cleanShards' }), 'btn primary');
        break;
    }
    btn('insp', `🔍 ${t('b01.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  } else {
    btn('close', t('b01.act.closeBench'), () => D({ type: 'closeBench' }), 'btn ghost');
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('b01.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{b01NameOf(w, id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('b01.act.none')}
      </div>
      <div className="row">{buttons}</div>
    </section>
  );
}

export { CLEAN_TRAY, PREP_SPOT, SAMPLE_TRAY, STEREO_BASE };
