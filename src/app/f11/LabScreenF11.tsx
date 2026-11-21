import { useTranslation } from 'react-i18next';
import { useF11 } from './store';
import { HudF11 } from './HudF11';
import { LabCanvasF11 } from './LabCanvasF11';
import { ActionPanelF11 } from './ActionPanelF11';
import { NotebookPanelF11 } from './NotebookPanelF11';
import { DialogsF11 } from './DialogsF11';
import { LensF11, eyeTargetFor } from './LensF11';
import { ToastsF11 } from './ui';
import { DemoPanelF11 } from './demo/DemoPanelF11';

function ZoomControlsF11() {
  const { t } = useTranslation();
  const stage = useF11((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('f11.cam.eye')} title={`${t('f11.cam.eye')} (O)`} onClick={() => cam()?.eyeLevel(eyeTargetFor(useF11.getState().selected))}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

/** Aviso de bloqueo de seguridad (desmontaje peligroso) o detención docente. */
function SafetyBannerF11() {
  const { t } = useTranslation();
  useF11((s) => s.version);
  const w = useF11((s) => s.runtime?.world);
  if (!w) return null;
  if (w.safety.stoppedByTeacher) return <div className="safety-banner critical" role="alert">⛔ {t('f11.safety.teacherStop')}</div>;
  if (!w.safety.block) return null;
  return <div className="safety-banner alert" role="alert">⚠ {t(`f11.safety.block.${w.safety.block.code}`)}</div>;
}

export function LabScreenF11() {
  const { t } = useTranslation();
  const notebookOpen = useF11((s) => s.notebookOpen);
  const paused = useF11((s) => s.paused);
  const demo = useF11((s) => !!s.demo);
  const sci = useF11((s) => s.runtime?.world.params.scientificMode ?? 'REALISTIC');
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudF11 />
      <div className="lab-main">
        <div />
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p01 f11${demo ? ' demo' : ''}`}>
          <LabCanvasF11 />
          <div className="model-badge" role="note">{t(`f11.intro.sci.${sci}`)}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelF11 />}
          <LensF11 />
          <ZoomControlsF11 />
          <ToastsF11 />
          <SafetyBannerF11 />
        </div>
        {notebookOpen ? <NotebookPanelF11 /> : <div />}
      </div>
      <ActionPanelF11 />
      <DialogsF11 />
    </div>
  );
}
