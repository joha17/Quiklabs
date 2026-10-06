import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StoichLab3D } from '../../engine/stoich/StoichLab3D';
import type { StoichHost } from '../../engine/stoich/host';
import { useP5 } from './store';
import { t } from '../i18n';
import { p5LiveFeedback } from './feedback';
import { p5NameTag } from './describe';
import { P5_STATIONS } from '../../practices/practice-05/definition';
import { launchDemo5 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const StoichScene = lazy(() => import('../../engine/stoich/StoichScene').then((m) => ({ default: m.StoichScene })));

const QUIET = new Set(['click', 'spark', 'clink', 'sand']);

/** Monta la escena 3D de la Práctica 5 y la conecta con el estado de la aplicación. */
export function LabCanvas5() {
  const { t: tr } = useTranslation();
  const runtime = useP5((s) => s.runtime);
  const quality = useP5((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: StoichHost = {
      runtime,
      t,
      getSelected: () => useP5.getState().selected,
      select: (id) => useP5.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useP5.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useP5.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useP5.getState().settings.reducedMotion,
      guidedHints: () => useP5.getState().settings.mode === 'GUIDED',
      showNames: () => useP5.getState().settings.showNames !== false,
      nameTag: (id) => p5NameTag(runtime.world, id),
      onHeldChange: (id) => useP5.getState().setHeld(id),
      onIR: (v) => useP5.setState({ irReading: v }),
    };
    const q = useP5.getState().settings.quality;
    const l = new StoichLab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    l.irReading = useP5.getState().irReading;
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab || !useP5.getState().demo) return;
    return launchDemo5(lab);
  }, [lab]);

  useEffect(() => {
    if (!lab) return;
    useP5.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useP5.getState();
      if (st.runtime && !st.paused && !st.demo) p5LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useP5.getState().setStage(null);
    };
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useP5.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '12345'.indexOf(k);
    if (idx >= 0) lab.goToStation(P5_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'v' || k === 'V') cam.eyeLevel();
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
      aria-label={tr('p5.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <StoichScene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
