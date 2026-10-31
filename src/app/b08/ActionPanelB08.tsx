import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB08 } from './store';
import { describeObject, b08NameOf } from './describe';
import { HoldButton } from './ui';
import type { PhotoCommand } from '../../simulation/photo-world/commands';
import { BALANCE, BOTTLES_HOME, BOTTLES_HOOD, DRAIN, GAS_RACK, GAS_TUBES, ORGANIC_WASTE, SPRIG_TRAY, TANK, TANK_SLOT } from '../../simulation/photo-world/geometry';

const A11Y_KEY = 'b08.a11yControls';
const readA11y = () => {
  try {
    return localStorage.getItem(A11Y_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Panel de acciones de B08 (§15): alternativa accesible a cada gesto de mano; despacha los mismos comandos que el controlador.
 * Los gestos finos (tapón, nivel, lecturas, solventes, regla) están en la mesa de trabajo. No hay «medir» ni «calcular»
 * automáticos.
 */
export function ActionPanelB08() {
  const { t } = useTranslation();
  useB08((s) => s.version);
  const rt = useB08((s) => s.runtime);
  const stage = useB08((s) => s.stage);
  const sel = useB08((s) => s.selected);
  const held = useB08((s) => s.held);
  const dispatch = useB08((s) => s.dispatch);
  const toast = useB08((s) => s.toast);
  const mode = useB08((s) => s.settings.mode);
  const demo = useB08((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
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
  const m = w.photo;
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
  const D = (c: PhotoCommand) => {
    const r = dispatch(c);
    if (!r.ok && r.code) {
      const k = `b08.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('b08.cmd.FAILED'));
    }
    return r;
  };
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, c: () => void, cls = 'btn') => add(key, <button className={cls} onClick={c}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const go = (support: string, x: number, y: number, z: number) => {
    if (!id) return;
    if (held) ctl?.release();
    const r = D({ type: 'setPose', id, pose: { x, y, z, rotationRad: 0 }, support });
    if (!r.ok && o) ctl?.layOnBench(id, o.pose.x, o.pose.y);
  };
  const benchPose = (x: number, y: number) => {
    if (!id) return;
    if (held) ctl?.release();
    D({ type: 'setPose', id, pose: { x, y, z: 0, rotationRad: 0 }, support: 'bench' });
  };

  if (id && o) {
    if (o.movable && !held) btn('take', t('b08.act.take'), () => ctl?.beginDrag(id, true), 'btn ghost');
    if (held) {
      btn('drop', t('b08.act.release'), () => ctl?.release(), 'btn primary');
      hold('up', `▲ ${t('b08.act.up')}`, () => ctl?.nudgeHeight(0.5), 90);
      hold('down', `▼ ${t('b08.act.down')}`, () => ctl?.nudgeHeight(-0.5), 90);
      btn('cancel', t('b08.act.cancel'), () => ctl?.cancel(), 'btn ghost');
    }
    switch (o.kind) {
      case 'elodeaSprig':
        for (const tube of [...Object.keys(m.tubes), ...Object.keys(m.btb)]) {
          const p = w.objects[tube].pose;
          if (o.support !== `tube:${tube}`) btn(`in-${tube}`, t('b08.act.into', { o: b08NameOf(w, tube) }), () => go(`tube:${tube}`, p.x, p.y, p.z + 0.5), 'btn ghost');
        }
        if (o.support !== 'sprigTray') btn('tray', t('b08.spot.sprigTray'), () => go('sprigTray', SPRIG_TRAY.x, SPRIG_TRAY.y, SPRIG_TRAY.z), 'btn ghost');
        break;
      case 'gasTube':
        for (const s of ['aqA', 'aqB'] as const) if (o.support !== s) btn(s, t(`b08.spot.${s}`), () => go(s, TANK_SLOT[s].x, TANK_SLOT[s].y, TANK.z), 'btn primary');
        if (o.support !== 'gasRack') btn('rack', t('b08.spot.gasRack'), () => go('gasRack', GAS_TUBES[id].x, GAS_TUBES[id].y, GAS_RACK.z - 5), 'btn ghost');
        break;
      case 'darkCover':
        for (const tube of [...Object.keys(m.tubes), ...Object.keys(m.btb)]) {
          const p = w.objects[tube].pose;
          if (o.support !== `cover:${tube}`) btn(`cv-${tube}`, t('b08.act.coverOver', { o: b08NameOf(w, tube) }), () => go(`cover:${tube}`, p.x, p.y, p.z), 'btn ghost');
        }
        if (o.support !== 'bench') btn('off', t('b08.act.toBench'), () => benchPose(o.pose.x + 8, o.pose.y - 8), 'btn ghost');
        break;
      case 'solventBottle':
        btn('hood', t('b08.act.toHood'), () => benchPose(BOTTLES_HOOD[id].x, BOTTLES_HOOD[id].y), 'btn primary');
        btn('home', t('b08.act.toShelf'), () => benchPose(BOTTLES_HOME[id].x, BOTTLES_HOME[id].y), 'btn ghost');
        break;
      case 'spinachLeaf':
        if (o.support !== 'balance' && !m.leaf.transferredG) btn('bal', t('b08.spot.balance'), () => go('balance', BALANCE.x, BALANCE.y, BALANCE.z), 'btn primary');
        break;
      case 'chromPaper':
      case 'extractVial':
        if (o.support !== 'organicWaste' && (id !== 'paper' || m.paper.cut)) {
          btn('waste', t('b08.spot.organicWaste'), () => go('organicWaste', ORGANIC_WASTE.x, ORGANIC_WASTE.y, 14), 'btn primary');
          btn('drain', t('b08.spot.drain'), () => go('drain', DRAIN.x, DRAIN.y, 3), 'btn ghost');
        }
        break;
      case 'lensPaper':
        btn('lens', t('b08.act.cleanLens'), () => D({ type: 'wipe', targetId: 'mic:lens', toolId: 'lp' }));
        break;
      case 'slideCase':
        btn('lid', w.slideCase.open ? t('b08.act.caseClose') : t('b08.act.caseOpen'), () => D({ type: 'openSlideCase', open: !w.slideCase.open }), 'btn primary');
        break;
      case 'glassBin':
        if (w.shards > 0) btn('shards', `🗑 ${t('b08.act.cleanShards')}`, () => D({ type: 'cleanShards' }), 'btn primary');
        break;
      case 'microscope': {
        const s = w.microscope;
        add('a11y', <button className="btn ghost" aria-expanded={a11y} onClick={toggleA11y}>{a11y ? '▾' : '▸'} {t('b08.act.a11yControls')}</button>);
        if (a11y) {
          btn('power', `⏻ ${s.power ? t('b08.act.powerOff') : t('b08.act.powerOn')}`, () => D({ type: 'setPower', device: 'microscope', on: !s.power }));
          btn('clip', s.clipOpen ? t('b08.act.clipClose') : t('b08.act.clipOpen'), () => D({ type: 'openClip', open: !s.clipOpen }));
          hold('cu', `${t('b08.act.coarse')} ▲`, () => D({ type: 'turnCoarse', deltaTurns: 0.1 }), 160);
          hold('cd', `${t('b08.act.coarse')} ▼`, () => D({ type: 'turnCoarse', deltaTurns: -0.1 }), 160);
          hold('fu', `${t('b08.act.fine')} ▲`, () => D({ type: 'turnFine', deltaTurns: 0.05 }), 160);
          hold('fd', `${t('b08.act.fine')} ▼`, () => D({ type: 'turnFine', deltaTurns: -0.05 }), 160);
          btn('tp', `${t('b08.act.turret')} ▶`, () => D({ type: 'turnTurret', deltaDeg: ctl?.nextTurretDelta(1) ?? 120 }));
          btn('side', `👁 ${t('b08.act.checkSide')}`, () => ctl?.checkSide());
          btn('eye', `🔬 ${w.view.instrument === 'compound' ? t('b08.act.closeEyepiece') : t('b08.act.lookEyepiece')}`, () => D({ type: 'observe', instrument: 'compound', open: w.view.instrument !== 'compound' }), 'btn primary');
        }
        break;
      }
    }
    if (o.kind !== 'microscope') {
      btn('insp', `🔍 ${t('b08.act.inspect')}`, () => {
        D({ type: 'inspect', target: id });
        stage?.focusObject(id, 4);
      }, 'btn ghost');
    }
  } else {
    btn('close', t('b08.act.closeBench'), () => D({ type: 'closeBench' }), 'btn ghost');
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('b08.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{b08NameOf(w, id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('b08.act.none')}
      </div>
      <div className="row">{buttons}</div>
    </section>
  );
}
