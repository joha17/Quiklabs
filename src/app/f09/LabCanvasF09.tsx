import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { F09Lab3D } from '../../engine/f09/F09Lab3D';
import type { F09Host } from '../../engine/f09/host';
import { goToStationF09, useF09 } from './store';
import { t } from '../i18n';
import { f09LiveFeedback } from './feedback';
import { f09NameTag } from './describe';
import { F09_STATIONS } from '../../practices/practice-f09/definition';
import { eyeTargetFor } from './LensF09';
import { launchDemoF09 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const F09Scene = lazy(() => import('../../engine/f09/F09Scene').then((m) => ({ default: m.F09Scene })));

const QUIET = new Set(['click', 'clink', 'metal']);

/** Monta la escena 3D de F09 y la conecta con el estado de la aplicación. */
export function LabCanvasF09() {
  const { t: tr } = useTranslation();
  const runtime = useF09((s) => s.runtime);
  const quality = useF09((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: F09Host = {
      runtime,
      t,
      getSelected: () => useF09.getState().selected,
      select: (id) => useF09.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useF09.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useF09.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useF09.getState().settings.reducedMotion,
      guidedHints: () => useF09.getState().settings.mode === 'GUIDED',
      showNames: () => useF09.getState().settings.showNames !== false,
      nameTag: (id) => f09NameTag(runtime.world, id),
      onHeldChange: (id) => useF09.getState().setHeld(id),
      onLens: (target) => useF09.getState().setSettings({ lens: target }),
    };
    const q = useF09.getState().settings.quality;
    const l = new F09Lab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab) return;
    useF09.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useF09.getState();
      if (st.runtime && !st.paused && !st.demo) f09LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useF09.getState().setStage(null);
    };
  }, [lab]);

  useEffect(() => {
    if (!lab || !useF09.getState().demo) return;
    return launchDemoF09(lab);
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useF09.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationF09(F09_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') cam.eyeLevel(eyeTargetFor(useF09.getState().selected));
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
      aria-label={tr('f09.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <F09Scene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
