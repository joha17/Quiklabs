import { useTranslation } from 'react-i18next';
import { useF12 } from './store';
import { HudF12 } from './HudF12';
import { LabCanvasF12 } from './LabCanvasF12';
import { ActionPanelF12 } from './ActionPanelF12';
import { NotebookPanelF12 } from './NotebookPanelF12';
import { DialogsF12 } from './DialogsF12';
import { LensF12, eyeTargetFor } from './LensF12';
import { ToastsF12 } from './ui';
import { DemoPanelF12 } from './demo/DemoPanelF12';

function ZoomControlsF12() {
  const { t } = useTranslation();
  const stage = useF12((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('f12.cam.eye')} title={`${t('f12.cam.eye')} (O)`} onClick={() => cam()?.eyeLevel(eyeTargetFor(useF12.getState().selected))}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

/** Aviso de bloqueo de seguridad (desmontaje peligroso) o detención docente. */
function SafetyBannerF12() {
  const { t } = useTranslation();
  useF12((s) => s.version);
  const w = useF12((s) => s.runtime?.world);
  if (!w) return null;
  if (w.safety.stoppedByTeacher) return <div className="safety-banner critical" role="alert">⛔ {t('f12.safety.teacherStop')}</div>;
  if (!w.safety.block) return null;
  return <div className="safety-banner alert" role="alert">⚠ {t(`f12.safety.block.${w.safety.block.code}`)}</div>;
}

export function LabScreenF12() {
  const { t } = useTranslation();
  const notebookOpen = useF12((s) => s.notebookOpen);
  const paused = useF12((s) => s.paused);
  const demo = useF12((s) => !!s.demo);
  const sci = useF12((s) => s.runtime?.world.params.scientificMode ?? 'REALISTIC');
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudF12 />
      <div className="lab-main">
        <div />
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p01 f12${demo ? ' demo' : ''}`}>
          <LabCanvasF12 />
          <div className="model-badge" role="note">{t(`f12.intro.sci.${sci}`)}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelF12 />}
          <LensF12 />
          <ZoomControlsF12 />
          <ToastsF12 />
          <SafetyBannerF12 />
        </div>
        {notebookOpen ? <NotebookPanelF12 /> : <div />}
      </div>
      <ActionPanelF12 />
      <DialogsF12 />
    </div>
  );
}
