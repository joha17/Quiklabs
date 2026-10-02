import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Lab3D } from '../../engine/Lab3D';

// La escena (React Three Fiber, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en la portada.
const LabScene = lazy(() => import('../../engine/scene/LabScene').then((m) => ({ default: m.LabScene })));
import type { EngineHost } from '../../engine/interaction/host';
import { useLab } from '../store';
import { t } from '../i18n';
import { liveFeedback } from '../feedback';
import { nameOf } from '../describe';
import { STATIONS } from '../../practices/practice-02/definition';

/** Monta la escena 3D y la conecta con el estado de la aplicación. */
export function LabCanvas() {
  const { t: tr } = useTranslation();
  const runtime = useLab((s) => s.runtime);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: EngineHost = {
      runtime,
      t,
      getSelected: () => useLab.getState().selected,
      select: (id) => useLab.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useLab.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (name !== 'click' && name !== 'stir') useLab.getState().caption(t(`cap.${name}`));
      },
      reducedMotion: () => useLab.getState().settings.reducedMotion,
      guidedHints: () => useLab.getState().settings.mode === 'GUIDED',
      onHeldChange: (id) => useLab.getState().setHeld(id),
    };
    const q = useLab.getState().settings.quality;
    const l = new Lab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab) return;
    useLab.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useLab.getState();
      if (st.runtime && !st.paused) liveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab }, (id) => nameOf(st.runtime!.world, id));
    }, 1000);
    return () => {
      clearInterval(live);
      useLab.getState().setStage(null);
    };
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      return;
    }
    // Cámara por teclado (§3.8, §14): 1–5 estaciones, J/L orbitar, I/K inclinar, +/− zoom, 0 restablecer.
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '12345'.indexOf(k);
    if (idx >= 0) lab.goToStation(STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else return;
    e.preventDefault();
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (lab?.controller.onKeyUp(e.key)) e.preventDefault();
  };

  return (
    <div
      className="canvas-host"
      role="application"
      tabIndex={0}
      aria-label={tr('a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <LabScene lab={lab} />
        </Suspense>
      )}
    </div>
  );
}
