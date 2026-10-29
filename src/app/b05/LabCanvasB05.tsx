import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { OpticalLab3D } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { goToStationB05, useB05 } from './store';
import { t } from '../i18n';
import { b05LiveFeedback } from './feedback';
import { b05NameTag } from './describe';
import { B05_STATIONS } from '../../practices/practice-b05/definition';
import { launchDemoB05 } from './demo';
import { EnzController } from '../../engine/optical/enzController';
import { meniscusAtEnz } from '../../engine/optical/objects3dEnz';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const OpticalScene = lazy(() => import('../../engine/optical/OpticalScene').then((m) => ({ default: m.OpticalScene })));

const QUIET = new Set(['click', 'clink', 'drip', 'stir']);

/** Monta la escena 3D de la práctica B05 y la conecta con el estado de la aplicación. */
export function LabCanvasB05() {
  const { t: tr } = useTranslation();
  const runtime = useB05((s) => s.runtime);
  const quality = useB05((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: OpticalHost = {
      runtime,
      t,
      getSelected: () => useB05.getState().selected,
      select: (id) => useB05.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useB05.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useB05.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useB05.getState().settings.reducedMotion,
      guidedHints: () => useB05.getState().settings.mode === 'GUIDED',
      showNames: () => useB05.getState().settings.showNames !== false,
      nameTag: (id) => b05NameTag(runtime.world, id),
      onHeldChange: (id) => useB05.getState().setHeld(id),
      // Mismo equipo y sala que B01/B02; estaciones y gestos enzimáticos propios de B05.
      stations: B05_STATIONS,
      createController: (h, lab) => new EnzController(h, lab),
      eyeTargetOf: (target) => meniscusAtEnz(runtime.world, target),
    };
    const q = useB05.getState().settings.quality;
    const l = new OpticalLab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab || !useB05.getState().demo) return;
    return launchDemoB05(lab);
  }, [lab]);

  useEffect(() => {
    if (!lab) return;
    useB05.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useB05.getState();
      if (st.runtime && !st.paused && !st.demo) b05LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useB05.getState().setStage(null);
    };
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useB05.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '1234567'.indexOf(k);
    if (idx >= 0) goToStationB05(B05_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') {
      const sel = useB05.getState().selected;
      cam.eyeLevel(sel && runtime && meniscusAtEnz(runtime.world, sel) ? sel : 'micSide');
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
      aria-label={tr('b05.a11y.canvas')}
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
