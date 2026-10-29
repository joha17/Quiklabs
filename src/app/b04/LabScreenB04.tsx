import { useTranslation } from 'react-i18next';
import { useB04 } from './store';
import { HudB04 } from './HudB04';
import { LabCanvasB04 } from './LabCanvasB04';
import { ActionPanelB04 } from './ActionPanelB04';
import { InventoryB04 } from './InventoryB04';
import { NotebookPanelB04 } from './NotebookPanelB04';
import { DialogsB04 } from './DialogsB04';
import { SafetyBannerB04, SafetyPanelB04 } from './SafetyPanelB04';
import { GuidePanelB04 } from './GuidePanelB04';
import { DebugPanelB04 } from './DebugPanelB04';
import { InstrumentsBarB04 } from './InstrumentsBarB04';
import { ToastsB04 } from './ui';
import { DemoPanelB04 } from './demo/DemoPanelB04';
import { EyepiecePanelB04 } from './EyepiecePanelB04';
import { meniscusAt } from '../../engine/optical/objects3dPerm';

function ZoomControlsB04() {
  const { t } = useTranslation();
  const stage = useB04((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    const sel = useB04.getState().selected;
    const rt = useB04.getState().runtime;
    cam()?.eyeLevel(sel && rt && meniscusAt(rt.world, sel) ? sel : 'micSide');
  };
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('b04.cam.eye')} title={`${t('b04.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreenB04() {
  const { t } = useTranslation();
  const notebookOpen = useB04((s) => s.notebookOpen);
  const inventoryOpen = useB04((s) => s.inventoryOpen);
  const mode = useB04((s) => s.settings.mode);
  const paused = useB04((s) => s.paused);
  const demo = useB04((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudB04 />
      <div className="lab-main">
        {inventoryOpen ? <InventoryB04 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p7 p8 b02 b04${demo ? ' demo' : ''}`}>
          <LabCanvasB04 />
          <InstrumentsBarB04 />
          <div className="model-badge" role="note">{t('b04.modelBadge')}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelB04 />}
          {!demo && mode === 'GUIDED' && <GuidePanelB04 />}
          {!demo && mode === 'DEBUG' && <DebugPanelB04 />}
          <SafetyPanelB04 />
          <EyepiecePanelB04 />
          <ZoomControlsB04 />
          <ToastsB04 />
          <SafetyBannerB04 />
        </div>
        {notebookOpen ? <NotebookPanelB04 /> : <div />}
      </div>
      <ActionPanelB04 />
      <DialogsB04 />
    </div>
  );
}
