import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useF04 } from './store';
import { describeObjectF04 } from './describe';
import { HoldButton } from './ui';
import type { F04Command } from '../../simulation/f04-world/commands';
import { BALLS_F3, ballFlying } from '../../simulation/f04-world/world';
import { GEOF04 } from '../../simulation/f04-world/geometry';
import { eyeTargetFor } from './LensF04';

/**
 * Panel de acciones de F04: alternativa accesible a cada gesto con el ratón. Ejecuta EXACTAMENTE los mismos comandos
 * del dominio que el controlador (girar el mando de elevación de a medio grado, el tornillo de nivel vuelta a vuelta,
 * correr la plataforma o la pantalla centímetro a centímetro, cargar la muesca, tirar del cordón); no es un atajo
 * científico: no hay «medir el alcance» ni «poner la plataforma donde cae».
 */
export function ActionPanelF04() {
  const { t } = useTranslation();
  useF04((s) => s.version);
  const rt = useF04((s) => s.runtime);
  const stage = useF04((s) => s.stage);
  const sel = useF04((s) => s.selected);
  const held = useF04((s) => s.held);
  const dispatch = useF04((s) => s.dispatch);
  const toast = useF04((s) => s.toast);
  const demo = useF04((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
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
  const run = (r: { ok: boolean; code?: string } | undefined | void) => {
    if (r && !r.ok && r.code) {
      const k = `f04.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('f04.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: F04Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, fn: () => unknown, cls = 'btn') => add(key, <button className={cls} onClick={() => run(fn() as never)}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const eye = (target = id) => btn('eye', `👁 ${t('f04.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(eyeTargetFor(target)), 'btn ghost');
  const l = w.launcher;

  if (id && o) {
    switch (o.kind) {
      case 'stand':
        btn('anchor', t(w.stand.anchored ? 'f04.act.unanchor' : 'f04.act.anchor'), () => D({ type: 'anchorStand', on: !w.stand.anchored }), w.stand.anchored ? 'btn ghost' : 'btn primary');
        hold('up', `▲ ${t('f04.act.standUp')}`, () => void D({ type: 'setStandHeight', cm: w.stand.heightCm + 1 }));
        hold('down', `▼ ${t('f04.act.standDown')}`, () => void D({ type: 'setStandHeight', cm: w.stand.heightCm - 1 }));
        hold('screwUp', `⟳ ${t('f04.act.screwUp')}`, () => void D({ type: 'turnLevelScrew', turns: 1 }), 300);
        hold('screwDown', `⟲ ${t('f04.act.screwDown')}`, () => void D({ type: 'turnLevelScrew', turns: -1 }), 300);
        btn('level', `🔍 ${t('f04.act.readLevel')}`, () => ctl?.readLevel(), 'btn primary');
        break;
      case 'launcher':
        hold('angUp', `▲ ${t('f04.act.angleUp')}`, () => void D({ type: 'setAngle', deg: l.angleDeg + 0.5 }));
        hold('angDown', `▼ ${t('f04.act.angleDown')}`, () => void D({ type: 'setAngle', deg: l.angleDeg - 0.5 }));
        if (!w.stand.anchored) {
          hold('yawL', `↶ ${t('f04.act.yawLeft')}`, () => void D({ type: 'setYaw', deg: l.yawDeg + 0.1 }), 200);
          hold('yawR', `↷ ${t('f04.act.yawRight')}`, () => void D({ type: 'setYaw', deg: l.yawDeg - 0.1 }), 200);
        }
        btn('zero', t('f04.act.zero'), () => D({ type: 'zeroProtractor' }));
        btn('readAngle', `🔍 ${t('f04.act.readAngle')}`, () => ctl?.readProtractor(), 'btn primary');
        btn('cap', t(l.capOn ? 'f04.act.capOff' : 'f04.act.capOn'), () => D({ type: 'setCap', on: !l.capOn }));
        for (const n of [1, 2, 3]) if (l.notch !== n) btn(`notch${n}`, t('f04.act.cock', { n }), () => D({ type: 'cock', notch: n }));
        if (l.notch > 0 && !l.loaded) btn('uncock', t('f04.act.uncock'), () => D({ type: 'cock', notch: 0 }), 'btn ghost');
        if (l.loaded) btn('unload', t('f04.act.unload'), () => D({ type: 'unloadBall' }), 'btn ghost');
        btn('fire', `🎯 ${t('f04.act.fire')}`, () => ctl?.fire(), 'btn primary');
        eye('launcher01');
        break;
      case 'gate':
        btn('mount', t(w.gate.mounted ? 'f04.act.unmount' : 'f04.act.mount'), () => D({ type: 'mountGate', on: !w.gate.mounted }));
        hold('offUp', `▲ ${t('f04.act.offsetUp')}`, () => void D({ type: 'setGateOffset', mm: w.gate.offsetMm + 0.5 }), 200);
        hold('offDown', `▼ ${t('f04.act.offsetDown')}`, () => void D({ type: 'setGateOffset', mm: w.gate.offsetMm - 0.5 }), 200);
        btn('plug', t(w.gate.connected ? 'f04.act.unplug' : 'f04.act.plug'), () => D({ type: 'connect', target: 'gate', on: !w.gate.connected }));
        break;
      case 'timer':
        btn('rate', t('f04.act.rate', { hz: w.timer.rateHz }), () => ctl?.cycleRate());
        btn('range', t('f04.act.range', { r: t(`f04.desc.range.${w.timer.range === 'short' ? 'long' : 'short'}`) }), () => D({ type: 'setClockRange', range: w.timer.range === 'short' ? 'long' : 'short' }));
        btn('readGate', `🔍 ${t('f04.act.readGate')}`, () => ctl?.readGate(), 'btn primary');
        btn('readImpact', `🔍 ${t('f04.act.readImpact')}`, () => ctl?.readImpact(), 'btn primary');
        eye('timer01');
        break;
      case 'platform': {
        const p = w.platform;
        hold('fwd', `▶ ${t('f04.act.platFwd')}`, () => void D({ type: 'movePlatform', xCm: p.x * 100 + 1, yCm: p.y * 100 }));
        hold('back', `◀ ${t('f04.act.platBack')}`, () => void D({ type: 'movePlatform', xCm: p.x * 100 - 1, yCm: p.y * 100 }));
        hold('left', `▲ ${t('f04.act.platSide')}`, () => void D({ type: 'movePlatform', xCm: p.x * 100, yCm: p.y * 100 + 1 }));
        hold('right', `▼ ${t('f04.act.platOther')}`, () => void D({ type: 'movePlatform', xCm: p.x * 100, yCm: p.y * 100 - 1 }));
        btn('center', t('f04.act.platCenter'), () => D({ type: 'movePlatform', xCm: p.x * 100, yCm: GEOF04.lane.yc }), 'btn ghost');
        btn('plug', t(p.connected ? 'f04.act.unplug' : 'f04.act.plug'), () => D({ type: 'connect', target: 'platform', on: !p.connected }));
        btn('cal', t('f04.act.calibrate'), () => D({ type: 'calibratePlatform' }));
        btn('tape', `🔍 ${t('f04.act.readTape')}`, () => ctl?.readTape('platform'), 'btn primary');
        break;
      }
      case 'screen': {
        const s = w.screen;
        btn('lane', t(s.inLane ? 'f04.act.screenOut' : 'f04.act.screenIn'), () => D({ type: 'moveScreen', xCm: s.x * 100, inLane: !s.inLane }));
        hold('fwd', `▶ ${t('f04.act.platFwd')}`, () => void D({ type: 'moveScreen', xCm: s.x * 100 + 1, inLane: s.inLane }));
        hold('back', `◀ ${t('f04.act.platBack')}`, () => void D({ type: 'moveScreen', xCm: s.x * 100 - 1, inLane: s.inLane }));
        btn('clear', t('f04.act.clear'), () => D({ type: 'clearScreen' }));
        if (s.inLane) btn('tape', `🔍 ${t('f04.act.readTape')}`, () => ctl?.readTape('screen'));
        btn('mark', `🔍 ${t('f04.act.readMark')}`, () => ctl?.readScreen(), 'btn primary');
        eye('screen01');
        break;
      }
      case 'barrier':
        btn('band', t(w.barrierClosed ? 'f04.act.barrierOpen' : 'f04.act.barrierClose'), () => D({ type: 'closeBarrier', on: !w.barrierClosed }), 'btn primary');
        break;
      case 'fan':
        btn('speed', t('f04.act.fanSpeed', { n: (w.fan.speed + 1) % w.params.fanMs.length }), () => ctl?.cycleFan());
        btn('dir', t('f04.act.fanDir', { d: t(`f04.desc.dir.${w.fan.dir}`) }), () => ctl?.cycleFanDir());
        break;
      case 'ball':
        if (o.support === 'tray' && !l.loaded) btn('load', t('f04.act.load'), () => D({ type: 'loadBall', ball: id }), 'btn primary');
        if (o.support === 'floor' || o.support === 'bench') btn('collect', t('f04.act.collect'), () => D({ type: 'collectBall', ball: id }), 'btn primary');
        break;
      case 'tray':
        BALLS_F3.filter((b) => w.objects[b].support === 'floor' || w.objects[b].support === 'bench').forEach((b) => btn(`col${b}`, t('f04.act.collectBall', { b: t(`f04.obj.${b}`) }), () => D({ type: 'collectBall', ball: b })));
        btn('close', `✅ ${t('f04.act.closeStation')}`, () => D({ type: 'closeStation' }), 'btn primary');
        break;
      case 'plumb':
        btn('drop', t('f04.act.dropPlumb'), () => D({ type: 'dropPlumb' }));
        if (w.plumbMark) btn('read', `🔍 ${t('f04.act.readTape')}`, () => ctl?.readTape('plumb'), 'btn primary');
        break;
      case 'floorTape':
        btn('align', t('f04.act.alignTape'), () => D({ type: 'alignTape' }), 'btn primary');
        eye('floorTape01');
        break;
      case 'heightRuler':
        btn('read', `🔍 ${t('f04.act.readHeight')}`, () => ctl?.readHeight('muzzle'), 'btn primary');
        eye('heightRuler01');
        break;
    }
    btn('insp', `🔍 ${t('f04.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  }
  if (w.safety.block) btn('ack', `⚠ ${t('f04.act.acknowledge')}`, () => D({ type: 'acknowledge' }), 'btn primary');
  void ballFlying;

  const desc = id ? describeObjectF04(w, id) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('f04.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">{id ? desc : t('f04.act.none')}</div>
      <div className="row">{buttons}</div>
    </section>
  );
}
