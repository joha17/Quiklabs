import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { F101Lab3D } from '../../engine/f101/F101Lab3D';
import type { F101Host } from '../../engine/f101/host';
import { goToStationF101, useF101 } from './store';
import { t } from '../i18n';
import { f101LiveFeedback } from './feedback';
import { f101NameTag } from './describe';
import { F101_STATIONS } from '../../practices/practice-f101/definition';
import { eyeTargetFor } from './LensF101';
import { SF } from '../../simulation/f101-world/world';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const F101Scene = lazy(() => import('../../engine/f101/F101Scene').then((m) => ({ default: m.F101Scene })));

const QUIET = new Set(['click', 'clink', 'metal']);

/** Monta la escena 3D de F101 y la conecta con el estado de la aplicación. */
export function LabCanvasF101() {
  const { t: tr } = useTranslation();
  const runtime = useF101((s) => s.runtime);
  const quality = useF101((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: F101Host = {
      runtime,
      t,
      getSelected: () => useF101.getState().selected,
      select: (id) => useF101.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useF101.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useF101.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useF101.getState().settings.reducedMotion,
      guidedHints: () => useF101.getState().settings.mode === 'GUIDED' && !runtime.world.scenarios.includes(SF.NO_HINTS),
      showNames: () => useF101.getState().settings.showNames !== false,
      nameTag: (id) => f101NameTag(runtime.world, id),
      onHeldChange: (id) => useF101.getState().setHeld(id),
      onLens: (target) => useF101.getState().setSettings({ lens: target }),
    };
    const q = useF101.getState().settings.quality;
    const l = new F101Lab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    // Escenario S06: la cámara de lectura queda 2 cm por encima del menisco.
    if (runtime.world.scenarios.includes(SF.ELEVATED_CAMERA)) l.eyeOffsetCm = 2;
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab) return;
    useF101.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useF101.getState();
      if (st.runtime && !st.paused && !st.demo) f101LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useF101.getState().setStage(null);
    };
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useF101.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationF101(F101_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') cam.eyeLevel(eyeTargetFor(useF101.getState().selected));
    else return;
    e.preventDefault();
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (lab && !lab.locked && lab.controller.onKeyUp()) e.preventDefault();
  };

  return (
    <div
      className="canvas-host"
      role="application"
      tabIndex={0}
      aria-label={tr('f101.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <F101Scene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
