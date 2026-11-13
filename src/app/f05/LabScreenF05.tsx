import { useTranslation } from 'react-i18next';
import { useF05 } from './store';
import { HudF05 } from './HudF05';
import { LabCanvasF05 } from './LabCanvasF05';
import { ActionPanelF05 } from './ActionPanelF05';
import { NotebookPanelF05 } from './NotebookPanelF05';
import { DialogsF05 } from './DialogsF05';
import { LensF05, eyeTargetFor } from './LensF05';
import { ToastsF05 } from './ui';
import { DemoPanelF05 } from './demo/DemoPanelF05';

function ZoomControlsF05() {
  const { t } = useTranslation();
  const stage = useF05((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('f05.cam.eye')} title={`${t('f05.cam.eye')} (O)`} onClick={() => cam()?.eyeLevel(eyeTargetFor(useF05.getState().selected))}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

/** Aviso de bloqueo de seguridad (desmontaje peligroso) o detención docente. */
function SafetyBannerF05() {
  const { t } = useTranslation();
  useF05((s) => s.version);
  const w = useF05((s) => s.runtime?.world);
  if (!w) return null;
  if (w.safety.stoppedByTeacher) return <div className="safety-banner critical" role="alert">⛔ {t('f05.safety.teacherStop')}</div>;
  if (!w.safety.block) return null;
  return <div className="safety-banner alert" role="alert">⚠ {t(`f05.safety.block.${w.safety.block.code}`)}</div>;
}

export function LabScreenF05() {
  const { t } = useTranslation();
  const notebookOpen = useF05((s) => s.notebookOpen);
  const paused = useF05((s) => s.paused);
  const demo = useF05((s) => !!s.demo);
  const sci = useF05((s) => s.runtime?.world.params.scientificMode ?? 'REALISTIC');
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudF05 />
      <div className="lab-main">
        <div />
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p01 f05${demo ? ' demo' : ''}`}>
          <LabCanvasF05 />
          <div className="model-badge" role="note">{t(`f05.intro.sci.${sci}`)}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelF05 />}
          <LensF05 />
          <ZoomControlsF05 />
          <ToastsF05 />
          <SafetyBannerF05 />
        </div>
        {notebookOpen ? <NotebookPanelF05 /> : <div />}
      </div>
      <ActionPanelF05 />
      <DialogsF05 />
    </div>
  );
}
