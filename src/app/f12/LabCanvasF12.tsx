import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { F12Lab3D } from '../../engine/f12/F12Lab3D';
import type { F12Host } from '../../engine/f12/host';
import { goToStationF12, useF12 } from './store';
import { t } from '../i18n';
import { f12LiveFeedback } from './feedback';
import { f12NameTag } from './describe';
import { F12_STATIONS } from '../../practices/practice-f12/definition';
import { eyeTargetFor } from './LensF12';
import { launchDemoF12 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const F12Scene = lazy(() => import('../../engine/f12/F12Scene').then((m) => ({ default: m.F12Scene })));

const QUIET = new Set(['click', 'clink', 'metal']);

/** Monta la escena 3D de F12 y la conecta con el estado de la aplicación. */
export function LabCanvasF12() {
  const { t: tr } = useTranslation();
  const runtime = useF12((s) => s.runtime);
  const quality = useF12((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: F12Host = {
      runtime,
      t,
      getSelected: () => useF12.getState().selected,
      select: (id) => useF12.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useF12.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useF12.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useF12.getState().settings.reducedMotion,
      guidedHints: () => useF12.getState().settings.mode === 'GUIDED',
      showNames: () => useF12.getState().settings.showNames !== false,
      nameTag: (id) => f12NameTag(runtime.world, id),
      onHeldChange: (id) => useF12.getState().setHeld(id),
      onLens: (target) => useF12.getState().setSettings({ lens: target }),
    };
    const q = useF12.getState().settings.quality;
    const l = new F12Lab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab) return;
    useF12.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useF12.getState();
      if (st.runtime && !st.paused && !st.demo) f12LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useF12.getState().setStage(null);
    };
  }, [lab]);

  useEffect(() => {
    if (!lab || !useF12.getState().demo) return;
    return launchDemoF12(lab);
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useF12.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationF12(F12_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') cam.eyeLevel(eyeTargetFor(useF12.getState().selected));
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
      aria-label={tr('f12.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <F12Scene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
