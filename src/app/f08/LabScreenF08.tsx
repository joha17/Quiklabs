import { useTranslation } from 'react-i18next';
import { useF08 } from './store';
import { HudF08 } from './HudF08';
import { LabCanvasF08 } from './LabCanvasF08';
import { ActionPanelF08 } from './ActionPanelF08';
import { NotebookPanelF08 } from './NotebookPanelF08';
import { DialogsF08 } from './DialogsF08';
import { LensF08, eyeTargetFor } from './LensF08';
import { ToastsF08 } from './ui';
import { DemoPanelF08 } from './demo/DemoPanelF08';

function ZoomControlsF08() {
  const { t } = useTranslation();
  const stage = useF08((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('f08.cam.eye')} title={`${t('f08.cam.eye')} (O)`} onClick={() => cam()?.eyeLevel(eyeTargetFor(useF08.getState().selected))}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

/** Aviso de bloqueo de seguridad (desmontaje peligroso) o detención docente. */
function SafetyBannerF08() {
  const { t } = useTranslation();
  useF08((s) => s.version);
  const w = useF08((s) => s.runtime?.world);
  if (!w) return null;
  if (w.safety.stoppedByTeacher) return <div className="safety-banner critical" role="alert">⛔ {t('f08.safety.teacherStop')}</div>;
  if (!w.safety.block) return null;
  return <div className="safety-banner alert" role="alert">⚠ {t(`f08.safety.block.${w.safety.block.code}`)}</div>;
}

export function LabScreenF08() {
  const { t } = useTranslation();
  const notebookOpen = useF08((s) => s.notebookOpen);
  const paused = useF08((s) => s.paused);
  const demo = useF08((s) => !!s.demo);
  const sci = useF08((s) => s.runtime?.world.params.scientificMode ?? 'REALISTIC');
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudF08 />
      <div className="lab-main">
        <div />
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p01 f08${demo ? ' demo' : ''}`}>
          <LabCanvasF08 />
          <div className="model-badge" role="note">{t(`f08.intro.sci.${sci}`)}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelF08 />}
          <LensF08 />
          <ZoomControlsF08 />
          <ToastsF08 />
          <SafetyBannerF08 />
        </div>
        {notebookOpen ? <NotebookPanelF08 /> : <div />}
      </div>
      <ActionPanelF08 />
      <DialogsF08 />
    </div>
  );
}
