import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB07 } from './store';
import { describeObject, b07NameOf } from './describe';
import { HoldButton } from './ui';
import type { MicroCommand } from '../../simulation/micro-world/commands';
import { STAIN_PHASES, STAIN_BOTTLE, type StainPhase } from '../../simulation/micro-world/types';
import { SMEAR_PAD, STAIN_RACK, VIEWER, trayPos } from '../../simulation/micro-world/geometry';
import { spotsFor } from '../../engine/optical/layout';

const A11Y_KEY = 'b07.a11yControls';
const readA11y = () => {
  try {
    return localStorage.getItem(A11Y_KEY) === '1';
  } catch {
    return false;
  }
};
const PHASE_OF = Object.fromEntries((Object.entries(STAIN_BOTTLE) as Array<[StainPhase, string]>).map(([p, b]) => [b, p]));

/**
 * Panel de acciones de B07 (§14): alternativa accesible a cada gesto. Despacha los mismos comandos que el controlador:
 * apoyos, asa y frotis (cobertura), fases de tinción (índice de decoloración), lavado, aceite, residuos y los mandos del
 * microscopio. No hay «teñir», «enfocar» ni «clasificar» automáticos; las medidas y los trazos se hacen en su panel.
 */
export function ActionPanelB07() {
  const { t } = useTranslation();
  useB07((s) => s.version);
  const rt = useB07((s) => s.runtime);
  const stage = useB07((s) => s.stage);
  const sel = useB07((s) => s.selected);
  const held = useB07((s) => s.held);
  const dispatch = useB07((s) => s.dispatch);
  const toast = useB07((s) => s.toast);
  const mode = useB07((s) => s.settings.mode);
  const demo = useB07((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
  const [cover, setCover] = useState(0.35);
  const [index, setIndex] = useState(1);
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
  const w = rt.world;
  const m = w.micro;
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
  const D = (c: MicroCommand) => {
    const r = dispatch(c);
    if (!r.ok && r.code) {
      const k = `b07.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('b07.cmd.FAILED'));
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
  const onPad = Object.values(w.objects).find((x) => x.support === 'smearPad')?.id ?? null;
  const onRack = Object.values(w.objects).find((x) => x.support === 'rack')?.id ?? null;
  const go = (support: string, x: number, y: number, z: number) => {
    if (!id) return;
    if (held) ctl?.release();
    const r = D({ type: 'setPose', id, pose: { x, y, z, rotationRad: 0 }, support });
    if (!r.ok && o) ctl?.layOnBench(id, o.pose.x, o.pose.y);
  };

  if (id && o) {
    if (o.movable && !held) btn('take', t('b07.act.take'), () => ctl?.beginDrag(id, true), 'btn ghost');
    if (held) {
      btn('drop', t('b07.act.release'), () => ctl?.release(), 'btn primary');
      hold('up', `▲ ${t('b07.act.up')}`, () => ctl?.nudgeHeight(0.5), 90);
      hold('down', `▼ ${t('b07.act.down')}`, () => ctl?.nudgeHeight(-0.5), 90);
      btn('cancel', t('b07.act.cancel'), () => ctl?.cancel(), 'btn ghost');
    }
    if (o.movable && (o.kind === 'slide' || o.kind === 'fixedSlide')) {
      for (const s of spotsFor(w, o.kind)) {
        if (s.id === o.support || s.id === 'prep' || s.id === 'prep2' || s.id === 'dirtyZone' || (s.id.startsWith('case:') && s.id.slice(5) !== w.slideCase.home[id])) continue;
        btn(`spot-${s.id}`, t(`b07.spot.${s.id.startsWith('case:') ? 'homeSlot' : s.id}`), () => go(s.id, s.x, s.y, s.z), 'btn ghost');
      }
      if (o.kind === 'slide') {
        if (o.support !== 'smearPad') btn('toPad', t('b07.spot.smearPad'), () => go('smearPad', SMEAR_PAD.x, SMEAR_PAD.y, SMEAR_PAD.z), 'btn ghost');
        if (o.support !== 'rack') btn('toRack', t('b07.spot.rack'), () => go('rack', STAIN_RACK.x, STAIN_RACK.y, STAIN_RACK.z), 'btn ghost');
      }
      if (o.support !== 'bench') btn('bench', t('b07.act.toBench'), () => ctl?.layOnBench(id, o.pose.x, o.pose.y - 6), 'btn ghost');
    }
    if (m.smears[id] && !w.evidence[`dry:${id}`]) btn('dry', t('b07.act.markDry'), () => D({ type: 'markSmearDry', slideId: id }));
    if (m.plates[id] && o.movable) {
      if (o.support !== 'viewer') btn('toViewer', t('b07.spot.viewer'), () => go('viewer', VIEWER.x, VIEWER.y, VIEWER.z), 'btn primary');
      if (o.support !== 'plateTray') btn('toTray', t('b07.spot.plateTray'), () => { const q = trayPos(Object.keys(m.plates).indexOf(id)); go('plateTray', q.x, q.y, q.z); }, 'btn ghost');
    }
    if (m.plates[id]?.restricted) btn('openR', t('b07.act.openRestricted'), () => D({ type: 'openPlate', plateId: id }), 'btn ghost');
    switch (o.kind) {
      case 'transferLoop':
        if (m.loop && onPad) {
          slider('cover', 'b07.act.coverage', cover, setCover);
          btn('smear', t('b07.act.smear'), () => D({ type: 'prepareVirtualSmear', slideId: onPad, declaredPlateId: m.loop!.plateId, coverage01: cover }), 'btn primary');
        } else if (!m.loop) add('loopHint', <span className="hint">{t('b07.hint.pickColony')}</span>);
        break;
      case 'stainBottle':
        if (!onRack) add('rackHint', <span className="hint">{t('b07.hint.stainOnRack')}</span>);
        else if (id === 'stW') btn('rinse', t('b07.act.rinse'), () => D({ type: 'rinseVirtualSlide', slideId: onRack }), 'btn primary');
        else {
          const phase = PHASE_OF[id];
          if (phase === 'decolorizer') slider('u', 'b07.act.decolorIndex', index, setIndex, 0, 2.5, 0.1, index.toFixed(1).replace('.', ','));
          btn('apply', t('b07.act.apply', { p: t(`b07.phase.${phase}`) }), () => D({ type: 'applyStainPhase', slideId: onRack, phase, index: phase === 'decolorizer' ? index : undefined }), 'btn primary');
        }
        break;
      case 'lensPaper':
        btn('lens', t('b07.act.cleanLens'), () => D({ type: 'wipe', targetId: 'mic:lens', toolId: 'lp' }));
        break;
      case 'oilBottle': {
        const onStage = w.microscope.slideOnStage;
        if (onStage) btn('oil', `🫗 ${t('b07.act.addOil')}`, () => D({ type: 'addImmersionOil', slideId: onStage, drops: 1 }), 'btn primary');
        else add('oilHint', <span className="hint">{t('b07.act.oilNeedsSlide')}</span>);
        break;
      }
      case 'burnerMock':
        btn('flame', t('b07.act.lightBurner'), () => D({ type: 'attemptFlame' }), 'btn ghost');
        break;
      case 'slideCase':
        btn('lid', w.slideCase.open ? t('b07.act.caseClose') : t('b07.act.caseOpen'), () => D({ type: 'openSlideCase', open: !w.slideCase.open }), 'btn primary');
        break;
      case 'glassBin':
        if (w.shards > 0) btn('shards', `🗑 ${t('b07.act.cleanShards')}`, () => D({ type: 'cleanShards' }), 'btn primary');
        break;
      case 'microscope': {
        const s = w.microscope;
        add('a11y', <button className="btn ghost" aria-expanded={a11y} onClick={toggleA11y}>{a11y ? '▾' : '▸'} {t('b07.act.a11yControls')}</button>);
        if (a11y) {
          btn('power', `⏻ ${s.power ? t('b07.act.powerOff') : t('b07.act.powerOn')}`, () => D({ type: 'setPower', device: 'microscope', on: !s.power }));
          btn('clip', s.clipOpen ? t('b07.act.clipClose') : t('b07.act.clipOpen'), () => D({ type: 'openClip', open: !s.clipOpen }));
          slider('light', 'b07.act.light', s.light01, (v) => D({ type: 'setIllumination', device: 'microscope', value01: v }));
          slider('diaph', 'b07.act.diaphragm', s.diaphragm01, (v) => D({ type: 'setDiaphragm', value01: v }));
          slider('cond', 'b07.act.condenser', s.condenser01, (v) => D({ type: 'setCondenser', value01: v }));
          hold('xm', 'X −', () => D({ type: 'setStageXY', xMm: s.stageXmm - 0.2, yMm: s.stageYmm }));
          hold('xp', 'X +', () => D({ type: 'setStageXY', xMm: s.stageXmm + 0.2, yMm: s.stageYmm }));
          hold('ym', 'Y −', () => D({ type: 'setStageXY', xMm: s.stageXmm, yMm: s.stageYmm - 0.2 }));
          hold('yp', 'Y +', () => D({ type: 'setStageXY', xMm: s.stageXmm, yMm: s.stageYmm + 0.2 }));
          hold('cu', `${t('b07.act.coarse')} ▲`, () => D({ type: 'turnCoarse', deltaTurns: 0.1 }), 160);
          hold('cd', `${t('b07.act.coarse')} ▼`, () => D({ type: 'turnCoarse', deltaTurns: -0.1 }), 160);
          hold('fu', `${t('b07.act.fine')} ▲`, () => D({ type: 'turnFine', deltaTurns: 0.05 }), 160);
          hold('fd', `${t('b07.act.fine')} ▼`, () => D({ type: 'turnFine', deltaTurns: -0.05 }), 160);
          btn('tp', `${t('b07.act.turret')} ▶`, () => D({ type: 'turnTurret', deltaDeg: ctl?.nextTurretDelta(1) ?? 120 }));
          btn('tm', `◀ ${t('b07.act.turret')}`, () => D({ type: 'turnTurret', deltaDeg: ctl?.nextTurretDelta(-1) ?? -120 }));
          btn('side', `👁 ${t('b07.act.checkSide')}`, () => ctl?.checkSide());
          btn('eye', `🔬 ${w.view.instrument === 'compound' ? t('b07.act.closeEyepiece') : t('b07.act.lookEyepiece')}`, () => D({ type: 'observe', instrument: 'compound', open: w.view.instrument !== 'compound' }), 'btn primary');
        }
        break;
      }
    }
    if (id && STAIN_PHASES.length && o.kind !== 'microscope') {
      btn('insp', `🔍 ${t('b07.act.inspect')}`, () => {
        D({ type: 'inspect', target: id });
        stage?.focusObject(id, 4);
      }, 'btn ghost');
    }
  } else {
    btn('close', t('b07.act.closeBench'), () => D({ type: 'closeBench' }), 'btn ghost');
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('b07.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{b07NameOf(w, id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('b07.act.none')}
      </div>
      <div className="row">{buttons}</div>
    </section>
  );
}
