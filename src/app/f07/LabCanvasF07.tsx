import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { F07Lab3D } from '../../engine/f07/F07Lab3D';
import type { F07Host } from '../../engine/f07/host';
import { goToStationF07, useF07 } from './store';
import { t } from '../i18n';
import { f07LiveFeedback } from './feedback';
import { f07NameTag } from './describe';
import { F07_STATIONS } from '../../practices/practice-f07/definition';
import { eyeTargetFor } from './LensF07';
import { launchDemoF07 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const F07Scene = lazy(() => import('../../engine/f07/F07Scene').then((m) => ({ default: m.F07Scene })));

const QUIET = new Set(['click', 'clink', 'metal']);

/** Monta la escena 3D de F07 y la conecta con el estado de la aplicación. */
export function LabCanvasF07() {
  const { t: tr } = useTranslation();
  const runtime = useF07((s) => s.runtime);
  const quality = useF07((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: F07Host = {
      runtime,
      t,
      getSelected: () => useF07.getState().selected,
      select: (id) => useF07.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useF07.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useF07.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useF07.getState().settings.reducedMotion,
      guidedHints: () => useF07.getState().settings.mode === 'GUIDED',
      showNames: () => useF07.getState().settings.showNames !== false,
      nameTag: (id) => f07NameTag(runtime.world, id),
      onHeldChange: (id) => useF07.getState().setHeld(id),
      onLens: (target) => useF07.getState().setSettings({ lens: target }),
    };
    const q = useF07.getState().settings.quality;
    const l = new F07Lab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab) return;
    useF07.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useF07.getState();
      if (st.runtime && !st.paused && !st.demo) f07LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useF07.getState().setStage(null);
    };
  }, [lab]);

  useEffect(() => {
    if (!lab || !useF07.getState().demo) return;
    return launchDemoF07(lab);
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useF07.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationF07(F07_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') cam.eyeLevel(eyeTargetFor(useF07.getState().selected));
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
      aria-label={tr('f07.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <F07Scene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
