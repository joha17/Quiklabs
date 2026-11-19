import { useTranslation } from 'react-i18next';
import { useF09 } from './store';
import { HudF09 } from './HudF09';
import { LabCanvasF09 } from './LabCanvasF09';
import { ActionPanelF09 } from './ActionPanelF09';
import { NotebookPanelF09 } from './NotebookPanelF09';
import { DialogsF09 } from './DialogsF09';
import { LensF09, eyeTargetFor } from './LensF09';
import { ToastsF09 } from './ui';
import { DemoPanelF09 } from './demo/DemoPanelF09';

function ZoomControlsF09() {
  const { t } = useTranslation();
  const stage = useF09((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('f09.cam.eye')} title={`${t('f09.cam.eye')} (O)`} onClick={() => cam()?.eyeLevel(eyeTargetFor(useF09.getState().selected))}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

/** Aviso de bloqueo de seguridad (desmontaje peligroso) o detención docente. */
function SafetyBannerF09() {
  const { t } = useTranslation();
  useF09((s) => s.version);
  const w = useF09((s) => s.runtime?.world);
  if (!w) return null;
  if (w.safety.stoppedByTeacher) return <div className="safety-banner critical" role="alert">⛔ {t('f09.safety.teacherStop')}</div>;
  if (!w.safety.block) return null;
  return <div className="safety-banner alert" role="alert">⚠ {t(`f09.safety.block.${w.safety.block.code}`)}</div>;
}

export function LabScreenF09() {
  const { t } = useTranslation();
  const notebookOpen = useF09((s) => s.notebookOpen);
  const paused = useF09((s) => s.paused);
  const demo = useF09((s) => !!s.demo);
  const sci = useF09((s) => s.runtime?.world.params.scientificMode ?? 'REALISTIC');
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudF09 />
      <div className="lab-main">
        <div />
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p01 f09${demo ? ' demo' : ''}`}>
          <LabCanvasF09 />
          <div className="model-badge" role="note">{t(`f09.intro.sci.${sci}`)}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelF09 />}
          <LensF09 />
          <ZoomControlsF09 />
          <ToastsF09 />
          <SafetyBannerF09 />
        </div>
        {notebookOpen ? <NotebookPanelF09 /> : <div />}
      </div>
      <ActionPanelF09 />
      <DialogsF09 />
    </div>
  );
}
