import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BondingLab3D } from '../../engine/bonding/BondingLab3D';
import type { BondingHost } from '../../engine/bonding/host';
import { goToStation07, useP07 } from './store';
import { t } from '../i18n';
import { p07LiveFeedback } from './feedback';
import { p07NameTag } from './describe';
import { P07_STATIONS } from '../../practices/practice-07/definition';
import { launchDemo07 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const BondingScene = lazy(() => import('../../engine/bonding/BondingScene').then((m) => ({ default: m.BondingScene })));

const QUIET = new Set(['click', 'clink', 'drip', 'stir']);

/** Monta la escena 3D de la Práctica 7 y la conecta con el estado de la aplicación. */
export function LabCanvas07() {
  const { t: tr } = useTranslation();
  const runtime = useP07((s) => s.runtime);
  const quality = useP07((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: BondingHost = {
      runtime,
      t,
      getSelected: () => useP07.getState().selected,
      select: (id) => useP07.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useP07.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useP07.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useP07.getState().settings.reducedMotion,
      guidedHints: () => useP07.getState().settings.mode === 'GUIDED',
      showNames: () => useP07.getState().settings.showNames !== false,
      nameTag: (id) => p07NameTag(runtime.world, id),
      onHeldChange: (id) => useP07.getState().setHeld(id),
    };
    const q = useP07.getState().settings.quality;
    const l = new BondingLab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab || !useP07.getState().demo) return;
    return launchDemo07(lab);
  }, [lab]);

  useEffect(() => {
    if (!lab) return;
    useP07.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useP07.getState();
      if (st.runtime && !st.paused && !st.demo) p07LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useP07.getState().setStage(null);
    };
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useP07.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStation07(P07_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') {
      const sel = useP07.getState().selected;
      cam.eyeLevel(sel === 'pipette25' || sel === 'thermometer07' || sel === 'caliper07' ? sel : sel === 'balance07' ? 'balance' : 'cylinder50');
    }
    else return;
    e.preventDefault();
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (lab && !lab.locked && lab.controller.onKeyUp(e.key)) e.preventDefault();
  };

  return (
    <div
      className="canvas-host"
      role="application"
      tabIndex={0}
      aria-label={tr('p7.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <BondingScene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
