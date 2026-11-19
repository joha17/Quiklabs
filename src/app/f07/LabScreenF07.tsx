import { useTranslation } from 'react-i18next';
import { useF07 } from './store';
import { HudF07 } from './HudF07';
import { LabCanvasF07 } from './LabCanvasF07';
import { ActionPanelF07 } from './ActionPanelF07';
import { NotebookPanelF07 } from './NotebookPanelF07';
import { DialogsF07 } from './DialogsF07';
import { LensF07, eyeTargetFor } from './LensF07';
import { ToastsF07 } from './ui';
import { DemoPanelF07 } from './demo/DemoPanelF07';

function ZoomControlsF07() {
  const { t } = useTranslation();
  const stage = useF07((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('f07.cam.eye')} title={`${t('f07.cam.eye')} (O)`} onClick={() => cam()?.eyeLevel(eyeTargetFor(useF07.getState().selected))}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

/** Aviso de bloqueo de seguridad (desmontaje peligroso) o detención docente. */
function SafetyBannerF07() {
  const { t } = useTranslation();
  useF07((s) => s.version);
  const w = useF07((s) => s.runtime?.world);
  if (!w) return null;
  if (w.safety.stoppedByTeacher) return <div className="safety-banner critical" role="alert">⛔ {t('f07.safety.teacherStop')}</div>;
  if (!w.safety.block) return null;
  return <div className="safety-banner alert" role="alert">⚠ {t(`f07.safety.block.${w.safety.block.code}`)}</div>;
}

export function LabScreenF07() {
  const { t } = useTranslation();
  const notebookOpen = useF07((s) => s.notebookOpen);
  const paused = useF07((s) => s.paused);
  const demo = useF07((s) => !!s.demo);
  const sci = useF07((s) => s.runtime?.world.params.scientificMode ?? 'REALISTIC');
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudF07 />
      <div className="lab-main">
        <div />
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p01 f07${demo ? ' demo' : ''}`}>
          <LabCanvasF07 />
          <div className="model-badge" role="note">{t(`f07.intro.sci.${sci}`)}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelF07 />}
          <LensF07 />
          <ZoomControlsF07 />
          <ToastsF07 />
          <SafetyBannerF07 />
        </div>
        {notebookOpen ? <NotebookPanelF07 /> : <div />}
      </div>
      <ActionPanelF07 />
      <DialogsF07 />
    </div>
  );
}
