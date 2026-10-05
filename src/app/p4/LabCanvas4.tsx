import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactionLab3D } from '../../engine/reaction/ReactionLab3D';
import type { ReactionHost } from '../../engine/reaction/host';
import { useP4 } from './store';
import { t } from '../i18n';
import { p4LiveFeedback } from './feedback';
import { p4NameTag } from './describe';
import { P4_STATIONS } from '../../practices/practice-04/definition';
import { launchDemo4 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const ReactionScene = lazy(() => import('../../engine/reaction/ReactionScene').then((m) => ({ default: m.ReactionScene })));

/** Monta la escena 3D de la Práctica 4 y la conecta con el estado de la aplicación. */
export function LabCanvas4() {
  const { t: tr } = useTranslation();
  const runtime = useP4((s) => s.runtime);
  const quality = useP4((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: ReactionHost = {
      runtime,
      t,
      getSelected: () => useP4.getState().selected,
      select: (id) => useP4.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useP4.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (name !== 'click' && name !== 'spark' && name !== 'drip' && name !== 'stir' && name !== 'clink') useP4.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useP4.getState().settings.reducedMotion,
      guidedHints: () => useP4.getState().settings.mode === 'GUIDED',
      showNames: () => useP4.getState().settings.showNames !== false,
      nameTag: (id) => p4NameTag(runtime.world, id),
      onHeldChange: (id) => useP4.getState().setHeld(id),
      requestMgWarning: () => {
        const st = useP4.getState();
        if (!st.runtime?.world.safety.mgWarningAccepted && !st.modal && !st.demo) st.setModal({ kind: 'mgWarning' });
      },
    };
    const q = useP4.getState().settings.quality;
    const l = new ReactionLab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab || !useP4.getState().demo) return;
    return launchDemo4(lab);
  }, [lab]);

  useEffect(() => {
    if (!lab) return;
    useP4.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useP4.getState();
      if (st.runtime && !st.paused && !st.demo) p4LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useP4.getState().setStage(null);
    };
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) lab.goToStation(P4_STATIONS[idx].id);
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
    if (lab && !lab.locked && lab.controller.onKeyUp(e.key)) e.preventDefault();
  };

  return (
    <div
      className="canvas-host"
      role="application"
      tabIndex={0}
      aria-label={tr('p4.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <ReactionScene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
