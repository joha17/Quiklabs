import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GasLab3D } from '../../engine/gas/GasLab3D';
import type { GasHost } from '../../engine/gas/host';
import { useP10 } from './store';
import { t } from '../i18n';
import { p10LiveFeedback } from './feedback';
import { p10NameTag } from './describe';
import { P10_STATIONS } from '../../practices/practice-10/definition';
import { launchDemo10 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const GasScene = lazy(() => import('../../engine/gas/GasScene').then((m) => ({ default: m.GasScene })));

const QUIET = new Set(['click', 'clink', 'drip', 'stir']);

/** Monta la escena 3D de la Práctica 10 y la conecta con el estado de la aplicación. */
export function LabCanvas10() {
  const { t: tr } = useTranslation();
  const runtime = useP10((s) => s.runtime);
  const quality = useP10((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: GasHost = {
      runtime,
      t,
      getSelected: () => useP10.getState().selected,
      select: (id) => useP10.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useP10.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useP10.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useP10.getState().settings.reducedMotion,
      guidedHints: () => useP10.getState().settings.mode === 'GUIDED',
      showNames: () => useP10.getState().settings.showNames !== false,
      nameTag: (id) => p10NameTag(runtime.world, id),
      onHeldChange: (id) => useP10.getState().setHeld(id),
    };
    const q = useP10.getState().settings.quality;
    const l = new GasLab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab || !useP10.getState().demo) return;
    return launchDemo10(lab);
  }, [lab]);

  useEffect(() => {
    if (!lab) return;
    useP10.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useP10.getState();
      if (st.runtime && !st.paused && !st.demo) p10LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useP10.getState().setStage(null);
    };
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useP10.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) lab.goToStation(P10_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') {
      const sel = useP10.getState().selected;
      cam.eyeLevel(sel === 'cylinder' || sel === 'flask' || sel === 'pipette' || sel === 'ruler' ? sel : sel === 'abalance' ? 'balance' : 'burette');
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
      aria-label={tr('p10.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <GasScene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
