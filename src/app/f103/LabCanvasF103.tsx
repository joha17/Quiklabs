import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { F103Lab3D } from '../../engine/f103/F103Lab3D';
import type { F103Host } from '../../engine/f103/host';
import { goToStationF103, useF103 } from './store';
import { t } from '../i18n';
import { f103LiveFeedback } from './feedback';
import { f103NameTag } from './describe';
import { F103_STATIONS } from '../../practices/practice-f103/definition';
import { eyeTargetFor } from './LensF103';
import { launchDemoF103 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const F103Scene = lazy(() => import('../../engine/f103/F103Scene').then((m) => ({ default: m.F103Scene })));

const QUIET = new Set(['click', 'clink', 'metal']);

/** Monta la escena 3D de F103 y la conecta con el estado de la aplicación. */
export function LabCanvasF103() {
  const { t: tr } = useTranslation();
  const runtime = useF103((s) => s.runtime);
  const quality = useF103((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: F103Host = {
      runtime,
      t,
      getSelected: () => useF103.getState().selected,
      select: (id) => useF103.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useF103.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useF103.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useF103.getState().settings.reducedMotion,
      guidedHints: () => useF103.getState().settings.mode === 'GUIDED',
      showNames: () => useF103.getState().settings.showNames !== false,
      nameTag: (id) => f103NameTag(runtime.world, id),
      onHeldChange: (id) => useF103.getState().setHeld(id),
      onLens: (target) => useF103.getState().setSettings({ lens: target }),
    };
    const q = useF103.getState().settings.quality;
    const l = new F103Lab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab) return;
    useF103.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useF103.getState();
      if (st.runtime && !st.paused && !st.demo) f103LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useF103.getState().setStage(null);
    };
  }, [lab]);

  useEffect(() => {
    if (!lab || !useF103.getState().demo) return;
    return launchDemoF103(lab);
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useF103.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationF103(F103_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') cam.eyeLevel(eyeTargetFor(useF103.getState().selected));
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
      aria-label={tr('f103.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <F103Scene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
