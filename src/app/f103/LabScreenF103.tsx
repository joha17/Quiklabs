import { useTranslation } from 'react-i18next';
import { useF103 } from './store';
import { HudF103 } from './HudF103';
import { LabCanvasF103 } from './LabCanvasF103';
import { ActionPanelF103 } from './ActionPanelF103';
import { NotebookPanelF103 } from './NotebookPanelF103';
import { DialogsF103 } from './DialogsF103';
import { LensF103, eyeTargetFor } from './LensF103';
import { ToastsF103 } from './ui';
import { DemoPanelF103 } from './demo/DemoPanelF103';

function ZoomControlsF103() {
  const { t } = useTranslation();
  const stage = useF103((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('f103.cam.eye')} title={`${t('f103.cam.eye')} (O)`} onClick={() => cam()?.eyeLevel(eyeTargetFor(useF103.getState().selected))}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

/** Aviso de bloqueo de seguridad (desmontaje peligroso) o detención docente. */
function SafetyBannerF103() {
  const { t } = useTranslation();
  useF103((s) => s.version);
  const w = useF103((s) => s.runtime?.world);
  if (!w) return null;
  if (w.safety.stoppedByTeacher) return <div className="safety-banner critical" role="alert">⛔ {t('f103.safety.teacherStop')}</div>;
  if (!w.safety.block) return null;
  return <div className="safety-banner alert" role="alert">⚠ {t(`f103.safety.block.${w.safety.block.code}`)}</div>;
}

export function LabScreenF103() {
  const { t } = useTranslation();
  const notebookOpen = useF103((s) => s.notebookOpen);
  const paused = useF103((s) => s.paused);
  const demo = useF103((s) => !!s.demo);
  const sci = useF103((s) => s.runtime?.world.params.scientificMode ?? 'REALISTIC');
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudF103 />
      <div className="lab-main">
        <div />
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p01 f103${demo ? ' demo' : ''}`}>
          <LabCanvasF103 />
          <div className="model-badge" role="note">{t(`f103.intro.sci.${sci}`)}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelF103 />}
          <LensF103 />
          <ZoomControlsF103 />
          <ToastsF103 />
          <SafetyBannerF103 />
        </div>
        {notebookOpen ? <NotebookPanelF103 /> : <div />}
      </div>
      <ActionPanelF103 />
      <DialogsF103 />
    </div>
  );
}
