import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { OrganicLab3D } from '../../engine/organic/OrganicLab3D';
import type { OrganicHost } from '../../engine/organic/host';
import { goToStation08, useP08 } from './store';
import { t } from '../i18n';
import { p08LiveFeedback } from './feedback';
import { p08NameTag } from './describe';
import { P08_STATIONS } from '../../practices/practice-08/definition';
import { launchDemo08 } from './demo';

// La escena (R3F, drei y Rapier con su WASM) se descarga al entrar al laboratorio, no en el menú.
const OrganicScene = lazy(() => import('../../engine/organic/OrganicScene').then((m) => ({ default: m.OrganicScene })));

const QUIET = new Set(['click', 'clink', 'drip', 'stir']);

/** Monta la escena 3D de la Práctica 8 y la conecta con el estado de la aplicación. */
export function LabCanvas08() {
  const { t: tr } = useTranslation();
  const runtime = useP08((s) => s.runtime);
  const quality = useP08((s) => s.settings.quality);

  const lab = useMemo(() => {
    if (!runtime) return null;
    const host: OrganicHost = {
      runtime,
      t,
      getSelected: () => useP08.getState().selected,
      select: (id) => useP08.getState().select(id),
      notify: (level, key, params) => {
        const text = t(key, params);
        if (text !== key) useP08.getState().toast(level, text);
      },
      sound: (name) => {
        l.audio.play(name);
        if (!QUIET.has(name)) useP08.getState().caption(t(`p4.cap.${name}`));
      },
      reducedMotion: () => useP08.getState().settings.reducedMotion,
      guidedHints: () => useP08.getState().settings.mode === 'GUIDED',
      showNames: () => useP08.getState().settings.showNames !== false,
      nameTag: (id) => p08NameTag(runtime.world, id),
      onHeldChange: (id) => useP08.getState().setHeld(id),
    };
    const q = useP08.getState().settings.quality;
    const l = new OrganicLab3D(host, q && q !== 'AUTO' ? q : 'MEDIUM');
    return l;
  }, [runtime]);

  useEffect(() => {
    if (!lab || !useP08.getState().demo) return;
    return launchDemo08(lab);
  }, [lab]);

  useEffect(() => {
    if (!lab) return;
    useP08.getState().setStage(lab);
    const live = setInterval(() => {
      const st = useP08.getState();
      if (st.runtime && !st.paused && !st.demo) p08LiveFeedback(st.runtime.world, st.settings.mode, st.attemptId, { ...st, stage: lab });
    }, 1000);
    return () => {
      clearInterval(live);
      useP08.getState().setStage(null);
    };
  }, [lab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!lab || e.target !== e.currentTarget) return;
    if (!lab.locked && lab.controller.onKeyDown(e.key, e.shiftKey)) {
      e.preventDefault();
      useP08.getState().bump();
      return;
    }
    const cam = lab.camera;
    if (!cam) return;
    const k = e.key;
    const idx = '123456'.indexOf(k);
    if (idx >= 0) goToStation08(P08_STATIONS[idx].id);
    else if (k === 'j' || k === 'J') cam.orbit(0.25, 0);
    else if (k === 'l' || k === 'L') cam.orbit(-0.25, 0);
    else if (k === 'i' || k === 'I') cam.orbit(0, -0.15);
    else if (k === 'k' || k === 'K') cam.orbit(0, 0.15);
    else if (k === '+' || k === '=') cam.zoomBy(1.25);
    else if (k === '-') cam.zoomBy(0.8);
    else if (k === '0') cam.reset();
    else if (k === 'o' || k === 'O') {
      const sel = useP08.getState().selected;
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
      aria-label={tr('p8.a11y.canvas')}
      aria-describedby="action-desc"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="lab-canvas"
    >
      {lab && (
        <Suspense fallback={<div className="scene-loading" role="status">{tr('hint.loading3d')}</div>}>
          <OrganicScene lab={lab} setting={quality} />
        </Suspense>
      )}
    </div>
  );
}
