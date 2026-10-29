import { useTranslation } from 'react-i18next';
import { useB05 } from './store';
import { HudB05 } from './HudB05';
import { LabCanvasB05 } from './LabCanvasB05';
import { ActionPanelB05 } from './ActionPanelB05';
import { InventoryB05 } from './InventoryB05';
import { NotebookPanelB05 } from './NotebookPanelB05';
import { DialogsB05 } from './DialogsB05';
import { SafetyBannerB05, SafetyPanelB05 } from './SafetyPanelB05';
import { GuidePanelB05 } from './GuidePanelB05';
import { DebugPanelB05 } from './DebugPanelB05';
import { InstrumentsBarB05 } from './InstrumentsBarB05';
import { ToastsB05 } from './ui';
import { DemoPanelB05 } from './demo/DemoPanelB05';
import { EyepiecePanelB05 } from './EyepiecePanelB05';
import { meniscusAtEnz } from '../../engine/optical/objects3dEnz';

function ZoomControlsB05() {
  const { t } = useTranslation();
  const stage = useB05((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    const sel = useB05.getState().selected;
    const rt = useB05.getState().runtime;
    cam()?.eyeLevel(sel && rt && meniscusAtEnz(rt.world, sel) ? sel : 'micSide');
  };
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('b05.cam.eye')} title={`${t('b05.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreenB05() {
  const { t } = useTranslation();
  const notebookOpen = useB05((s) => s.notebookOpen);
  const inventoryOpen = useB05((s) => s.inventoryOpen);
  const mode = useB05((s) => s.settings.mode);
  const paused = useB05((s) => s.paused);
  const demo = useB05((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudB05 />
      <div className="lab-main">
        {inventoryOpen ? <InventoryB05 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p7 p8 b02 b05${demo ? ' demo' : ''}`}>
          <LabCanvasB05 />
          <InstrumentsBarB05 />
          <div className="model-badge" role="note">{t('b05.modelBadge')}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelB05 />}
          {!demo && mode === 'GUIDED' && <GuidePanelB05 />}
          {!demo && mode === 'DEBUG' && <DebugPanelB05 />}
          <SafetyPanelB05 />
          <EyepiecePanelB05 />
          <ZoomControlsB05 />
          <ToastsB05 />
          <SafetyBannerB05 />
        </div>
        {notebookOpen ? <NotebookPanelB05 /> : <div />}
      </div>
      <ActionPanelB05 />
      <DialogsB05 />
    </div>
  );
}
