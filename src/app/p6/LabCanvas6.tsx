import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalorLab3D } from '../../engine/calor/CalorLab3D';
import type { CalorHost } from '../../engine/calor/host';
import { useP6 } from './store';
import { t } from '../i18n';
import { p6LiveFeedback } from './feedback';
import { p6NameTag } from './describe';
import { P6_STATIONS } from '../../practices/practice-06/definition';
import { launchDemo6 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const CalorScene = lazy(() => import('../../engine/calor/CalorScene').then((m) => ({ default: m.CalorScene })));

const QUIET = new Set(['click', 'clink', 'drip', 'stir']);

/** Monta la escena 3D de la Práctica 6 y la conecta con el estado de la aplicación. */
export function LabCanvas6() {
  const { t: tr } = useTranslation();
  const runtime = useP6((s) => s.runtime);
  const quality = useP6((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: CalorHost = {
      runtime,
      t,
      getSelected: () => useP6.getState().selected,
      select: (id) => useP6.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useP6.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useP6.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useP6.getState().settings.reducedMotion,
      guidedHints: () => useP6.getState().settings.mode === 'GUIDED',
      showNames: () => useP6.getState().settings.showNames !== false,
      nameTag: (id) => p6NameTag(runtime.world, id),
      onHeldChange: (id) => useP6.getState().setHeld(id),
    };
    const q = useP6.getState().settings.quality;
    const l = new CalorLab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab || !useP6.getState().demo) return;
    return launchDemo6(lab);
  }, [lab]);

  useEffect(() => {
    if (!lab) return;
    useP6.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useP6.getState();
      if (st.runtime && !st.paused && !st.demo) p6LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useP6.getState().setStage(null);
    };
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useP6.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '12345'.indexOf(k);
    if (idx >= 0) lab.goToStation(P6_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'v' || k === 'V') cam.eyeLevel(useP6.getState().selected === 'balance' ? 'balance' : 'cylinder');
    else return;
    e.preventDefault();
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (lab && !lab.locked && lab.controller.onKeyUp(e.key)) e.preventDefault();
  };

  return (
    <div
      className="canvas-host"
      role="application"
      tabIndex={0}
      aria-label={tr('p6.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <CalorScene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
