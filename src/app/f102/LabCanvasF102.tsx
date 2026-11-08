import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { F102Lab3D } from '../../engine/f102/F102Lab3D';
import type { F102Host } from '../../engine/f102/host';
import { goToStationF102, useF102 } from './store';
import { t } from '../i18n';
import { f102LiveFeedback } from './feedback';
import { f102NameTag } from './describe';
import { F102_STATIONS } from '../../practices/practice-f102/definition';
import { eyeTargetFor } from './LensF102';
import { launchDemoF102 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const F102Scene = lazy(() => import('../../engine/f102/F102Scene').then((m) => ({ default: m.F102Scene })));

const QUIET = new Set(['click', 'clink', 'metal']);

/** Monta la escena 3D de F102 y la conecta con el estado de la aplicación. */
export function LabCanvasF102() {
  const { t: tr } = useTranslation();
  const runtime = useF102((s) => s.runtime);
  const quality = useF102((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: F102Host = {
      runtime,
      t,
      getSelected: () => useF102.getState().selected,
      select: (id) => useF102.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useF102.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useF102.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useF102.getState().settings.reducedMotion,
      guidedHints: () => useF102.getState().settings.mode === 'GUIDED',
      showNames: () => useF102.getState().settings.showNames !== false,
      nameTag: (id) => f102NameTag(runtime.world, id),
      onHeldChange: (id) => useF102.getState().setHeld(id),
      onLens: (target) => useF102.getState().setSettings({ lens: target }),
    };
    const q = useF102.getState().settings.quality;
    const l = new F102Lab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab) return;
    useF102.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useF102.getState();
      if (st.runtime && !st.paused && !st.demo) f102LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useF102.getState().setStage(null);
    };
  }, [lab]);

  useEffect(() => {
    if (!lab || !useF102.getState().demo) return;
    return launchDemoF102(lab);
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useF102.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationF102(F102_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') cam.eyeLevel(eyeTargetFor(useF102.getState().selected));
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
      aria-label={tr('f102.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <F102Scene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
