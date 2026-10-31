import { useTranslation } from 'react-i18next';
import { useB09 } from './store';
import { HudB09 } from './HudB09';
import { LabCanvasB09 } from './LabCanvasB09';
import { ActionPanelB09 } from './ActionPanelB09';
import { InventoryB09 } from './InventoryB09';
import { NotebookPanelB09 } from './NotebookPanelB09';
import { DialogsB09 } from './DialogsB09';
import { SafetyBannerB09, SafetyPanelB09 } from './SafetyPanelB09';
import { GuidePanelB09 } from './GuidePanelB09';
import { DebugPanelB09 } from './DebugPanelB09';
import { InstrumentsBarB09 } from './InstrumentsBarB09';
import { ToastsB09 } from './ui';
import { DemoPanelB09 } from './demo/DemoPanelB09';
import { EyepiecePanelB09 } from './EyepiecePanelB09';
import { BenchPanelB09 } from './BenchPanelB09';

function ZoomControlsB09() {
  const { t } = useTranslation();
  const stage = useB09((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    const sel = useB09.getState().selected;
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
      <button className="btn small" aria-label={t('b09.cam.eye')} title={`${t('b09.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreenB09() {
  const { t } = useTranslation();
  const notebookOpen = useB09((s) => s.notebookOpen);
  const inventoryOpen = useB09((s) => s.inventoryOpen);
  const mode = useB09((s) => s.settings.mode);
  const paused = useB09((s) => s.paused);
  const demo = useB09((s) => !!s.demo);
  return (
    <div className="lab lab-b09">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudB09 />
      <div className="lab-main">
        {inventoryOpen ? <InventoryB09 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p7 p8 b09${demo ? ' demo' : ''}`}>
          <LabCanvasB09 />
          <InstrumentsBarB09 />
          <div className="model-badge" role="note">{t('b09.modelBadge')}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelB09 />}
          {!demo && mode === 'GUIDED' && <GuidePanelB09 />}
          {!demo && mode === 'DEBUG' && <DebugPanelB09 />}
          <SafetyPanelB09 />
          <EyepiecePanelB09 />
          <BenchPanelB09 />
          <ZoomControlsB09 />
          <ToastsB09 />
          <SafetyBannerB09 />
        </div>
        {notebookOpen ? <NotebookPanelB09 /> : <div />}
      </div>
      <ActionPanelB09 />
      <DialogsB09 />
    </div>
  );
}
