import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { OpticalLab3D } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { goToStationB06, useB06 } from './store';
import { t } from '../i18n';
import { b06LiveFeedback } from './feedback';
import { b06NameTag } from './describe';
import { B06_STATIONS } from '../../practices/practice-b06/definition';
import { launchDemoB06 } from './demo';
import { DivController } from '../../engine/optical/divController';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const OpticalScene = lazy(() => import('../../engine/optical/OpticalScene').then((m) => ({ default: m.OpticalScene })));

const QUIET = new Set(['click', 'clink', 'drip', 'stir']);

/** Monta la escena 3D de la práctica B06 y la conecta con el estado de la aplicación. */
export function LabCanvasB06() {
  const { t: tr } = useTranslation();
  const runtime = useB06((s) => s.runtime);
  const quality = useB06((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: OpticalHost = {
      runtime,
      t,
      getSelected: () => useB06.getState().selected,
      select: (id) => useB06.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useB06.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useB06.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useB06.getState().settings.reducedMotion,
      guidedHints: () => useB06.getState().settings.mode === 'GUIDED',
      showNames: () => useB06.getState().settings.showNames !== false,
      nameTag: (id) => b06NameTag(runtime.world, id),
      onHeldChange: (id) => useB06.getState().setHeld(id),
      // Mismo equipo y sala que B01; estaciones y gestos de obtención de tejido propios de B06.
      stations: B06_STATIONS,
      createController: (h, lab) => new DivController(h, lab),
    };
    const q = useB06.getState().settings.quality;
    const l = new OpticalLab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab || !useB06.getState().demo) return;
    return launchDemoB06(lab);
  }, [lab]);

  useEffect(() => {
    if (!lab) return;
    useB06.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useB06.getState();
      if (st.runtime && !st.paused && !st.demo) b06LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useB06.getState().setStage(null);
    };
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useB06.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationB06(B06_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') {
      const sel = useB06.getState().selected;
      cam.eyeLevel(sel === 'ste' ? 'ste' : 'micSide');
    }
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
      aria-label={tr('b06.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <OpticalScene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
