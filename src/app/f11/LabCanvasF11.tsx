import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { F11Lab3D } from '../../engine/f11/F11Lab3D';
import type { F11Host } from '../../engine/f11/host';
import { goToStationF11, useF11 } from './store';
import { t } from '../i18n';
import { f11LiveFeedback } from './feedback';
import { f11NameTag } from './describe';
import { F11_STATIONS } from '../../practices/practice-f11/definition';
import { eyeTargetFor } from './LensF11';
import { launchDemoF11 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const F11Scene = lazy(() => import('../../engine/f11/F11Scene').then((m) => ({ default: m.F11Scene })));

const QUIET = new Set(['click', 'clink', 'metal']);

/** Monta la escena 3D de F11 y la conecta con el estado de la aplicación. */
export function LabCanvasF11() {
  const { t: tr } = useTranslation();
  const runtime = useF11((s) => s.runtime);
  const quality = useF11((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: F11Host = {
      runtime,
      t,
      getSelected: () => useF11.getState().selected,
      select: (id) => useF11.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useF11.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useF11.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useF11.getState().settings.reducedMotion,
      guidedHints: () => useF11.getState().settings.mode === 'GUIDED',
      showNames: () => useF11.getState().settings.showNames !== false,
      nameTag: (id) => f11NameTag(runtime.world, id),
      onHeldChange: (id) => useF11.getState().setHeld(id),
      onLens: (target) => useF11.getState().setSettings({ lens: target }),
    };
    const q = useF11.getState().settings.quality;
    const l = new F11Lab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab) return;
    useF11.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useF11.getState();
      if (st.runtime && !st.paused && !st.demo) f11LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useF11.getState().setStage(null);
    };
  }, [lab]);

  useEffect(() => {
    if (!lab || !useF11.getState().demo) return;
    return launchDemoF11(lab);
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useF11.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationF11(F11_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') cam.eyeLevel(eyeTargetFor(useF11.getState().selected));
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
      aria-label={tr('f11.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <F11Scene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
