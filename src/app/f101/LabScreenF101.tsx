import { useTranslation } from 'react-i18next';
import { useF101 } from './store';
import { HudF101 } from './HudF101';
import { LabCanvasF101 } from './LabCanvasF101';
import { ActionPanelF101 } from './ActionPanelF101';
import { NotebookPanelF101 } from './NotebookPanelF101';
import { DialogsF101 } from './DialogsF101';
import { LensF101, eyeTargetFor } from './LensF101';
import { ToastsF101 } from './ui';

function ZoomControlsF101() {
  const { t } = useTranslation();
  const stage = useF101((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('f101.cam.eye')} title={`${t('f101.cam.eye')} (O)`} onClick={() => cam()?.eyeLevel(eyeTargetFor(useF101.getState().selected))}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

/** Aviso de bloqueo de seguridad (desmontaje peligroso) o detención docente. */
function SafetyBannerF101() {
  const { t } = useTranslation();
  useF101((s) => s.version);
  const w = useF101((s) => s.runtime?.world);
  if (!w) return null;
  if (w.safety.stoppedByTeacher) return <div className="safety-banner critical" role="alert">⛔ {t('f101.safety.teacherStop')}</div>;
  if (!w.safety.block) return null;
  return <div className="safety-banner alert" role="alert">⚠ {t(`f101.safety.block.${w.safety.block.code}`)}</div>;
}

export function LabScreenF101() {
  const { t } = useTranslation();
  const notebookOpen = useF101((s) => s.notebookOpen);
  const paused = useF101((s) => s.paused);
  const sci = useF101((s) => s.runtime?.world.params.scientificMode ?? 'REALISTIC');
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudF101 />
      <div className="lab-main">
        <div />
        <div className="canvas-wrap p3 p4 p5 p6 p10 p01 f101">
          <LabCanvasF101 />
          <div className="model-badge" role="note">{t(`f101.intro.sci.${sci}`)}</div>
          {paused && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          <LensF101 />
          <ZoomControlsF101 />
          <ToastsF101 />
          <SafetyBannerF101 />
        </div>
        {notebookOpen ? <NotebookPanelF101 /> : <div />}
      </div>
      <ActionPanelF101 />
      <DialogsF101 />
    </div>
  );
}
