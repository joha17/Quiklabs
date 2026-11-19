import { useTranslation } from 'react-i18next';
import { useF06 } from './store';
import { HudF06 } from './HudF06';
import { LabCanvasF06 } from './LabCanvasF06';
import { ActionPanelF06 } from './ActionPanelF06';
import { NotebookPanelF06 } from './NotebookPanelF06';
import { DialogsF06 } from './DialogsF06';
import { LensF06, eyeTargetFor } from './LensF06';
import { ToastsF06 } from './ui';
import { DemoPanelF06 } from './demo/DemoPanelF06';

function ZoomControlsF06() {
  const { t } = useTranslation();
  const stage = useF06((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('f06.cam.eye')} title={`${t('f06.cam.eye')} (O)`} onClick={() => cam()?.eyeLevel(eyeTargetFor(useF06.getState().selected))}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

/** Aviso de bloqueo de seguridad (desmontaje peligroso) o detención docente. */
function SafetyBannerF06() {
  const { t } = useTranslation();
  useF06((s) => s.version);
  const w = useF06((s) => s.runtime?.world);
  if (!w) return null;
  if (w.safety.stoppedByTeacher) return <div className="safety-banner critical" role="alert">⛔ {t('f06.safety.teacherStop')}</div>;
  if (!w.safety.block) return null;
  return <div className="safety-banner alert" role="alert">⚠ {t(`f06.safety.block.${w.safety.block.code}`)}</div>;
}

export function LabScreenF06() {
  const { t } = useTranslation();
  const notebookOpen = useF06((s) => s.notebookOpen);
  const paused = useF06((s) => s.paused);
  const demo = useF06((s) => !!s.demo);
  const sci = useF06((s) => s.runtime?.world.params.scientificMode ?? 'REALISTIC');
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudF06 />
      <div className="lab-main">
        <div />
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p01 f06${demo ? ' demo' : ''}`}>
          <LabCanvasF06 />
          <div className="model-badge" role="note">{t(`f06.intro.sci.${sci}`)}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelF06 />}
          <LensF06 />
          <ZoomControlsF06 />
          <ToastsF06 />
          <SafetyBannerF06 />
        </div>
        {notebookOpen ? <NotebookPanelF06 /> : <div />}
      </div>
      <ActionPanelF06 />
      <DialogsF06 />
    </div>
  );
}
