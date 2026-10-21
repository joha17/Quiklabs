import { useTranslation } from 'react-i18next';
import { useB01 } from './store';
import { HudB01 } from './HudB01';
import { LabCanvasB01 } from './LabCanvasB01';
import { ActionPanelB01 } from './ActionPanelB01';
import { InventoryB01 } from './InventoryB01';
import { NotebookPanelB01 } from './NotebookPanelB01';
import { DialogsB01 } from './DialogsB01';
import { SafetyBannerB01, SafetyPanelB01 } from './SafetyPanelB01';
import { GuidePanelB01 } from './GuidePanelB01';
import { DebugPanelB01 } from './DebugPanelB01';
import { InstrumentsBarB01 } from './InstrumentsBarB01';
import { ToastsB01 } from './ui';
import { DemoPanelB01 } from './demo/DemoPanelB01';
import { EyepiecePanelB01 } from './EyepiecePanelB01';

function ZoomControlsB01() {
  const { t } = useTranslation();
  const stage = useB01((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    const sel = useB01.getState().selected;
    cam()?.eyeLevel(sel === 'ste' ? 'ste' : 'micSide');
  };
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('b01.cam.eye')} title={`${t('b01.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreenB01() {
  const { t } = useTranslation();
  const notebookOpen = useB01((s) => s.notebookOpen);
  const inventoryOpen = useB01((s) => s.inventoryOpen);
  const mode = useB01((s) => s.settings.mode);
  const paused = useB01((s) => s.paused);
  const demo = useB01((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudB01 />
      <div className="lab-main">
        {inventoryOpen ? <InventoryB01 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p7 p8 b01${demo ? ' demo' : ''}`}>
          <LabCanvasB01 />
          <InstrumentsBarB01 />
          <div className="model-badge" role="note">{t('b01.modelBadge')}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelB01 />}
          {!demo && mode === 'GUIDED' && <GuidePanelB01 />}
          {!demo && mode === 'DEBUG' && <DebugPanelB01 />}
          <SafetyPanelB01 />
          <EyepiecePanelB01 />
          <ZoomControlsB01 />
          <ToastsB01 />
          <SafetyBannerB01 />
        </div>
        {notebookOpen ? <NotebookPanelB01 /> : <div />}
      </div>
      <ActionPanelB01 />
      <DialogsB01 />
    </div>
  );
}
