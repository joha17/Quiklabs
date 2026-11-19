import { useTranslation } from 'react-i18next';
import { useF04 } from './store';
import { HudF04 } from './HudF04';
import { LabCanvasF04 } from './LabCanvasF04';
import { ActionPanelF04 } from './ActionPanelF04';
import { NotebookPanelF04 } from './NotebookPanelF04';
import { DialogsF04 } from './DialogsF04';
import { LensF04, eyeTargetFor } from './LensF04';
import { ToastsF04 } from './ui';
import { DemoPanelF04 } from './demo/DemoPanelF04';

function ZoomControlsF04() {
  const { t } = useTranslation();
  const stage = useF04((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('f04.cam.eye')} title={`${t('f04.cam.eye')} (O)`} onClick={() => cam()?.eyeLevel(eyeTargetFor(useF04.getState().selected))}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

/** Aviso de bloqueo de seguridad (desmontaje peligroso) o detención docente. */
function SafetyBannerF04() {
  const { t } = useTranslation();
  useF04((s) => s.version);
  const w = useF04((s) => s.runtime?.world);
  if (!w) return null;
  if (w.safety.stoppedByTeacher) return <div className="safety-banner critical" role="alert">⛔ {t('f04.safety.teacherStop')}</div>;
  if (!w.safety.block) return null;
  return <div className="safety-banner alert" role="alert">⚠ {t(`f04.safety.block.${w.safety.block.code}`)}</div>;
}

export function LabScreenF04() {
  const { t } = useTranslation();
  const notebookOpen = useF04((s) => s.notebookOpen);
  const paused = useF04((s) => s.paused);
  const demo = useF04((s) => !!s.demo);
  const sci = useF04((s) => s.runtime?.world.params.scientificMode ?? 'REALISTIC');
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudF04 />
      <div className="lab-main">
        <div />
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p01 f04${demo ? ' demo' : ''}`}>
          <LabCanvasF04 />
          <div className="model-badge" role="note">{t(`f04.intro.sci.${sci}`)}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelF04 />}
          <LensF04 />
          <ZoomControlsF04 />
          <ToastsF04 />
          <SafetyBannerF04 />
        </div>
        {notebookOpen ? <NotebookPanelF04 /> : <div />}
      </div>
      <ActionPanelF04 />
      <DialogsF04 />
    </div>
  );
}
