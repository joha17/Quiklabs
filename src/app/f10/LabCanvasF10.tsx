import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { F10Lab3D } from '../../engine/f10/F10Lab3D';
import type { F10Host } from '../../engine/f10/host';
import { goToStationF10, useF10 } from './store';
import { t } from '../i18n';
import { f10LiveFeedback } from './feedback';
import { f10NameTag } from './describe';
import { F10_STATIONS } from '../../practices/practice-f10/definition';
import { eyeTargetFor } from './LensF10';
import { launchDemoF10 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const F10Scene = lazy(() => import('../../engine/f10/F10Scene').then((m) => ({ default: m.F10Scene })));

const QUIET = new Set(['click', 'clink', 'metal']);

/** Monta la escena 3D de F10 y la conecta con el estado de la aplicación. */
export function LabCanvasF10() {
  const { t: tr } = useTranslation();
  const runtime = useF10((s) => s.runtime);
  const quality = useF10((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: F10Host = {
      runtime,
      t,
      getSelected: () => useF10.getState().selected,
      select: (id) => useF10.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useF10.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useF10.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useF10.getState().settings.reducedMotion,
      guidedHints: () => useF10.getState().settings.mode === 'GUIDED',
      showNames: () => useF10.getState().settings.showNames !== false,
      nameTag: (id) => f10NameTag(runtime.world, id),
      onHeldChange: (id) => useF10.getState().setHeld(id),
      onLens: (target) => useF10.getState().setSettings({ lens: target }),
    };
    const q = useF10.getState().settings.quality;
    const l = new F10Lab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab) return;
    useF10.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useF10.getState();
      if (st.runtime && !st.paused && !st.demo) f10LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useF10.getState().setStage(null);
    };
  }, [lab]);

  useEffect(() => {
    if (!lab || !useF10.getState().demo) return;
    return launchDemoF10(lab);
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useF10.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationF10(F10_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') cam.eyeLevel(eyeTargetFor(useF10.getState().selected));
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
      aria-label={tr('f10.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <F10Scene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
