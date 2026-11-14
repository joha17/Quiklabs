import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { F08Lab3D } from '../../engine/f08/F08Lab3D';
import type { F08Host } from '../../engine/f08/host';
import { goToStationF08, useF08 } from './store';
import { t } from '../i18n';
import { f08LiveFeedback } from './feedback';
import { f08NameTag } from './describe';
import { F08_STATIONS } from '../../practices/practice-f08/definition';
import { eyeTargetFor } from './LensF08';
import { launchDemoF08 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const F08Scene = lazy(() => import('../../engine/f08/F08Scene').then((m) => ({ default: m.F08Scene })));

const QUIET = new Set(['click', 'clink', 'metal']);

/** Monta la escena 3D de F08 y la conecta con el estado de la aplicación. */
export function LabCanvasF08() {
  const { t: tr } = useTranslation();
  const runtime = useF08((s) => s.runtime);
  const quality = useF08((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: F08Host = {
      runtime,
      t,
      getSelected: () => useF08.getState().selected,
      select: (id) => useF08.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useF08.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useF08.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useF08.getState().settings.reducedMotion,
      guidedHints: () => useF08.getState().settings.mode === 'GUIDED',
      showNames: () => useF08.getState().settings.showNames !== false,
      nameTag: (id) => f08NameTag(runtime.world, id),
      onHeldChange: (id) => useF08.getState().setHeld(id),
      onLens: (target) => useF08.getState().setSettings({ lens: target }),
    };
    const q = useF08.getState().settings.quality;
    const l = new F08Lab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab) return;
    useF08.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useF08.getState();
      if (st.runtime && !st.paused && !st.demo) f08LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useF08.getState().setStage(null);
    };
  }, [lab]);

  useEffect(() => {
    if (!lab || !useF08.getState().demo) return;
    return launchDemoF08(lab);
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useF08.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationF08(F08_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') cam.eyeLevel(eyeTargetFor(useF08.getState().selected));
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
      aria-label={tr('f08.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <F08Scene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
