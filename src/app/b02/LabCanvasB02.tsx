import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { OpticalLab3D } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { goToStationB02, useB02 } from './store';
import { t } from '../i18n';
import { b02LiveFeedback } from './feedback';
import { b02NameTag } from './describe';
import { B02_STATIONS } from '../../practices/practice-b02/definition';
import { launchDemoB02 } from './demo';
import { CellController } from '../../engine/optical/cellController';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const OpticalScene = lazy(() => import('../../engine/optical/OpticalScene').then((m) => ({ default: m.OpticalScene })));

const QUIET = new Set(['click', 'clink', 'drip', 'stir']);

/** Monta la escena 3D de la práctica B02 y la conecta con el estado de la aplicación. */
export function LabCanvasB02() {
  const { t: tr } = useTranslation();
  const runtime = useB02((s) => s.runtime);
  const quality = useB02((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: OpticalHost = {
      runtime,
      t,
      getSelected: () => useB02.getState().selected,
      select: (id) => useB02.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useB02.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useB02.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useB02.getState().settings.reducedMotion,
      guidedHints: () => useB02.getState().settings.mode === 'GUIDED',
      showNames: () => useB02.getState().settings.showNames !== false,
      nameTag: (id) => b02NameTag(runtime.world, id),
      onHeldChange: (id) => useB02.getState().setHeld(id),
      // Mismo equipo y sala que B01; estaciones y gestos de obtención de tejido propios de B02.
      stations: B02_STATIONS,
      createController: (h, lab) => new CellController(h, lab),
    };
    const q = useB02.getState().settings.quality;
    const l = new OpticalLab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab || !useB02.getState().demo) return;
    return launchDemoB02(lab);
  }, [lab]);

  useEffect(() => {
    if (!lab) return;
    useB02.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useB02.getState();
      if (st.runtime && !st.paused && !st.demo) b02LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useB02.getState().setStage(null);
    };
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useB02.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStationB02(B02_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') {
      const sel = useB02.getState().selected;
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
      aria-label={tr('b02.a11y.canvas')}
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
