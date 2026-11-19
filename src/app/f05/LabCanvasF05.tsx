import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { F05Lab3D } from '../../engine/f05/F05Lab3D';
import type { F05Host } from '../../engine/f05/host';
import { goToStationF05, useF05 } from './store';
import { t } from '../i18n';
import { f05LiveFeedback } from './feedback';
import { f05NameTag } from './describe';
import { F05_STATIONS } from '../../practices/practice-f05/definition';
import { eyeTargetFor } from './LensF05';
import { launchDemoF05 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const F05Scene = lazy(() => import('../../engine/f05/F05Scene').then((m) => ({ default: m.F05Scene })));

const QUIET = new Set(['click', 'clink', 'metal']);

/** Monta la escena 3D de F05 y la conecta con el estado de la aplicación. */
export function LabCanvasF05() {
  const { t: tr } = useTranslation();
  const runtime = useF05((s) => s.runtime);
  const quality = useF05((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: F05Host = {
      runtime,
      t,
      getSelected: () => useF05.getState().selected,
      select: (id) => useF05.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useF05.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useF05.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useF05.getState().settings.reducedMotion,
      guidedHints: () => useF05.getState().settings.mode === 'GUIDED',
      showNames: () => useF05.getState().settings.showNames !== false,
      nameTag: (id) => f05NameTag(runtime.world, id),
      onHeldChange: (id) => useF05.getState().setHeld(id),
      onLens: (target) => useF05.getState().setSettings({ lens: target }),
    };
    const q = useF05.getState().settings.quality;
    const l = new F05Lab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab) return;
    useF05.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useF05.getState();
      if (st.runtime && !st.paused && !st.demo) f05LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useF05.getState().setStage(null);
    };
  }, [lab]);

  useEffect(() => {
    if (!lab || !useF05.getState().demo) return;
    return launchDemoF05(lab);
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useF05.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationF05(F05_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') cam.eyeLevel(eyeTargetFor(useF05.getState().selected));
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
      aria-label={tr('f05.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <F05Scene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
