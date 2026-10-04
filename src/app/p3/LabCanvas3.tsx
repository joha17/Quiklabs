import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlameLab3D } from '../../engine/flame/FlameLab3D';
import type { FlameHost } from '../../engine/flame/host';
import { useP3 } from './store';
import { t } from '../i18n';
import { p3LiveFeedback } from './feedback';
import { p3NameTag } from './describe';
import { P3_STATIONS } from '../../practices/practice-03/definition';
import { launchDemo3 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const FlameScene = lazy(() => import('../../engine/flame/FlameScene').then((m) => ({ default: m.FlameScene })));

/** Monta la escena 3D de la Práctica 3 y la conecta con el estado de la aplicación. */
export function LabCanvas3() {
  const { t: tr } = useTranslation();
  const runtime = useP3((s) => s.runtime);
  const quality = useP3((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: FlameHost = {
      runtime,
      t,
      getSelected: () => useP3.getState().selected,
      select: (id) => useP3.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useP3.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (name !== 'click' && name !== 'spark') useP3.getState().caption(t(`p3.cap.${name}`));
      },
      reducedMotion: () => useP3.getState().settings.reducedMotion,
      guidedHints: () => useP3.getState().settings.mode === 'GUIDED',
      showNames: () => useP3.getState().settings.showNames !== false,
      nameTag: (id) => p3NameTag(runtime.world, id),
      onHeldChange: (id) => useP3.getState().setHeld(id),
      pendingPartLabel: () => useP3.getState().partLabel,
      onPartClicked: (part) => {
        const st = useP3.getState();
        const label = st.partLabel;
        if (!label) return;
        st.dispatch({ type: 'identifyPart', part, answer: label });
        st.setPartLabel(null);
      },
    };
    const q = useP3.getState().settings.quality;
    const l = new FlameLab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  // Demostración: el director conduce esta escena (se detiene al salir o al recrear el laboratorio).
  useEffect(() => {
    if (!lab || !useP3.getState().demo) return;
    return launchDemo3(lab);
  }, [lab]);

  useEffect(() => {
    if (!lab) return;
    useP3.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useP3.getState();
      if (st.runtime && !st.paused) p3LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useP3.getState().setStage(null);
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
    const idx = '12345'.indexOf(k);
    if (idx >= 0) lab.goToStation(P3_STATIONS[idx].id);
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
      aria-label={tr('p3.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <FlameScene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
