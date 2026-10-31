import { useTranslation } from 'react-i18next';
import { useB08 } from './store';
import { HudB08 } from './HudB08';
import { LabCanvasB08 } from './LabCanvasB08';
import { ActionPanelB08 } from './ActionPanelB08';
import { InventoryB08 } from './InventoryB08';
import { NotebookPanelB08 } from './NotebookPanelB08';
import { DialogsB08 } from './DialogsB08';
import { SafetyBannerB08, SafetyPanelB08 } from './SafetyPanelB08';
import { GuidePanelB08 } from './GuidePanelB08';
import { DebugPanelB08 } from './DebugPanelB08';
import { InstrumentsBarB08 } from './InstrumentsBarB08';
import { ToastsB08 } from './ui';
import { DemoPanelB08 } from './demo/DemoPanelB08';
import { EyepiecePanelB08 } from './EyepiecePanelB08';
import { BenchPanelB08 } from './BenchPanelB08';

function ZoomControlsB08() {
  const { t } = useTranslation();
  const stage = useB08((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    cam()?.eyeLevel('micSide');
  };
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('b08.cam.eye')} title={`${t('b08.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreenB08() {
  const { t } = useTranslation();
  const notebookOpen = useB08((s) => s.notebookOpen);
  const inventoryOpen = useB08((s) => s.inventoryOpen);
  const mode = useB08((s) => s.settings.mode);
  const paused = useB08((s) => s.paused);
  const demo = useB08((s) => !!s.demo);
  return (
    <div className="lab lab-b08">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudB08 />
      <div className="lab-main">
        {inventoryOpen ? <InventoryB08 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p7 p8 b08${demo ? ' demo' : ''}`}>
          <LabCanvasB08 />
          <InstrumentsBarB08 />
          <div className="model-badge" role="note">{t('b08.modelBadge')}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelB08 />}
          {!demo && mode === 'GUIDED' && <GuidePanelB08 />}
          {!demo && mode === 'DEBUG' && <DebugPanelB08 />}
          <SafetyPanelB08 />
          <EyepiecePanelB08 />
          <BenchPanelB08 />
          <ZoomControlsB08 />
          <ToastsB08 />
          <SafetyBannerB08 />
        </div>
        {notebookOpen ? <NotebookPanelB08 /> : <div />}
      </div>
      <ActionPanelB08 />
      <DialogsB08 />
    </div>
  );
}
