import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { F06Lab3D } from '../../engine/f06/F06Lab3D';
import type { F06Host } from '../../engine/f06/host';
import { goToStationF06, useF06 } from './store';
import { t } from '../i18n';
import { f06LiveFeedback } from './feedback';
import { f06NameTag } from './describe';
import { F06_STATIONS } from '../../practices/practice-f06/definition';
import { eyeTargetFor } from './LensF06';
import { launchDemoF06 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const F06Scene = lazy(() => import('../../engine/f06/F06Scene').then((m) => ({ default: m.F06Scene })));

const QUIET = new Set(['click', 'clink', 'metal']);

/** Monta la escena 3D de F06 y la conecta con el estado de la aplicación. */
export function LabCanvasF06() {
  const { t: tr } = useTranslation();
  const runtime = useF06((s) => s.runtime);
  const quality = useF06((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: F06Host = {
      runtime,
      t,
      getSelected: () => useF06.getState().selected,
      select: (id) => useF06.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useF06.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useF06.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useF06.getState().settings.reducedMotion,
      guidedHints: () => useF06.getState().settings.mode === 'GUIDED',
      showNames: () => useF06.getState().settings.showNames !== false,
      nameTag: (id) => f06NameTag(runtime.world, id),
      onHeldChange: (id) => useF06.getState().setHeld(id),
      onLens: (target) => useF06.getState().setSettings({ lens: target }),
    };
    const q = useF06.getState().settings.quality;
    const l = new F06Lab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab) return;
    useF06.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useF06.getState();
      if (st.runtime && !st.paused && !st.demo) f06LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useF06.getState().setStage(null);
    };
  }, [lab]);

  useEffect(() => {
    if (!lab || !useF06.getState().demo) return;
    return launchDemoF06(lab);
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useF06.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationF06(F06_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') cam.eyeLevel(eyeTargetFor(useF06.getState().selected));
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
      aria-label={tr('f06.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <F06Scene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
