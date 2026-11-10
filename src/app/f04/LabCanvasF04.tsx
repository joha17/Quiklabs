import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { F04Lab3D } from '../../engine/f04/F04Lab3D';
import type { F04Host } from '../../engine/f04/host';
import { goToStationF04, useF04 } from './store';
import { t } from '../i18n';
import { f04LiveFeedback } from './feedback';
import { f04NameTag } from './describe';
import { F04_STATIONS } from '../../practices/practice-f04/definition';
import { eyeTargetFor } from './LensF04';
import { launchDemoF04 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const F04Scene = lazy(() => import('../../engine/f04/F04Scene').then((m) => ({ default: m.F04Scene })));

const QUIET = new Set(['click', 'clink', 'metal']);

/** Monta la escena 3D de F04 y la conecta con el estado de la aplicación. */
export function LabCanvasF04() {
  const { t: tr } = useTranslation();
  const runtime = useF04((s) => s.runtime);
  const quality = useF04((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: F04Host = {
      runtime,
      t,
      getSelected: () => useF04.getState().selected,
      select: (id) => useF04.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useF04.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useF04.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useF04.getState().settings.reducedMotion,
      guidedHints: () => useF04.getState().settings.mode === 'GUIDED',
      showNames: () => useF04.getState().settings.showNames !== false,
      nameTag: (id) => f04NameTag(runtime.world, id),
      onHeldChange: (id) => useF04.getState().setHeld(id),
      onLens: (target) => useF04.getState().setSettings({ lens: target }),
    };
    const q = useF04.getState().settings.quality;
    const l = new F04Lab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab) return;
    useF04.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useF04.getState();
      if (st.runtime && !st.paused && !st.demo) f04LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useF04.getState().setStage(null);
    };
  }, [lab]);

  useEffect(() => {
    if (!lab || !useF04.getState().demo) return;
    return launchDemoF04(lab);
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useF04.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationF04(F04_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') cam.eyeLevel(eyeTargetFor(useF04.getState().selected));
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
      aria-label={tr('f04.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <F04Scene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
