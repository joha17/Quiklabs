import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CationLab3D } from '../../engine/cations/CationLab3D';
import type { CationHost } from '../../engine/cations/host';
import { goToStation09, useP09 } from './store';
import { t } from '../i18n';
import { p09LiveFeedback } from './feedback';
import { p09NameTag } from './describe';
import { P09_STATIONS } from '../../practices/practice-09/definition';
import { launchDemo09 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const CationScene = lazy(() => import('../../engine/cations/CationScene').then((m) => ({ default: m.CationScene })));

const QUIET = new Set(['click', 'clink', 'drip', 'stir']);

/** Monta la escena 3D de la Práctica 9 y la conecta con el estado de la aplicación. */
export function LabCanvas09() {
  const { t: tr } = useTranslation();
  const runtime = useP09((s) => s.runtime);
  const quality = useP09((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: CationHost = {
      runtime,
      t,
      getSelected: () => useP09.getState().selected,
      select: (id) => useP09.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useP09.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useP09.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useP09.getState().settings.reducedMotion,
      guidedHints: () => useP09.getState().settings.mode === 'GUIDED',
      showNames: () => useP09.getState().settings.showNames !== false,
      nameTag: (id) => p09NameTag(runtime.world, id),
      onHeldChange: (id) => useP09.getState().setHeld(id),
    };
    const q = useP09.getState().settings.quality;
    const l = new CationLab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab || !useP09.getState().demo) return;
    return launchDemo09(lab);
  }, [lab]);

  useEffect(() => {
    if (!lab) return;
    useP09.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useP09.getState();
      if (st.runtime && !st.paused && !st.demo) p09LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useP09.getState().setStage(null);
    };
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useP09.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStation09(P09_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') {
      const sel = useP09.getState().selected;
      cam.eyeLevel(sel ?? 'cyl10');
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
      aria-label={tr('p9.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <CationScene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
