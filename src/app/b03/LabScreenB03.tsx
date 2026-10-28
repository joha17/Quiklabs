import { useTranslation } from 'react-i18next';
import { useB03 } from './store';
import { HudB03 } from './HudB03';
import { LabCanvasB03 } from './LabCanvasB03';
import { ActionPanelB03 } from './ActionPanelB03';
import { InventoryB03 } from './InventoryB03';
import { NotebookPanelB03 } from './NotebookPanelB03';
import { DialogsB03 } from './DialogsB03';
import { SafetyBannerB03, SafetyPanelB03 } from './SafetyPanelB03';
import { GuidePanelB03 } from './GuidePanelB03';
import { DebugPanelB03 } from './DebugPanelB03';
import { InstrumentsBarB03 } from './InstrumentsBarB03';
import { ToastsB03 } from './ui';
import { DemoPanelB03 } from './demo/DemoPanelB03';
import { EyepiecePanelB03 } from './EyepiecePanelB03';
import { meniscusAt } from '../../engine/optical/objects3dPerm';

function ZoomControlsB03() {
  const { t } = useTranslation();
  const stage = useB03((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    const sel = useB03.getState().selected;
    const rt = useB03.getState().runtime;
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
      <button className="btn small" aria-label={t('b03.cam.eye')} title={`${t('b03.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreenB03() {
  const { t } = useTranslation();
  const notebookOpen = useB03((s) => s.notebookOpen);
  const inventoryOpen = useB03((s) => s.inventoryOpen);
  const mode = useB03((s) => s.settings.mode);
  const paused = useB03((s) => s.paused);
  const demo = useB03((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudB03 />
      <div className="lab-main">
        {inventoryOpen ? <InventoryB03 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p7 p8 b02 b03${demo ? ' demo' : ''}`}>
          <LabCanvasB03 />
          <InstrumentsBarB03 />
          <div className="model-badge" role="note">{t('b03.modelBadge')}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelB03 />}
          {!demo && mode === 'GUIDED' && <GuidePanelB03 />}
          {!demo && mode === 'DEBUG' && <DebugPanelB03 />}
          <SafetyPanelB03 />
          <EyepiecePanelB03 />
          <ZoomControlsB03 />
          <ToastsB03 />
          <SafetyBannerB03 />
        </div>
        {notebookOpen ? <NotebookPanelB03 /> : <div />}
      </div>
      <ActionPanelB03 />
      <DialogsB03 />
    </div>
  );
}
