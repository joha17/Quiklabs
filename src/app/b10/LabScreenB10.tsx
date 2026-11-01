import { useTranslation } from 'react-i18next';
import { useB10 } from './store';
import { HudB10 } from './HudB10';
import { LabCanvasB10 } from './LabCanvasB10';
import { ActionPanelB10 } from './ActionPanelB10';
import { InventoryB10 } from './InventoryB10';
import { NotebookPanelB10 } from './NotebookPanelB10';
import { DialogsB10 } from './DialogsB10';
import { SafetyBannerB10, SafetyPanelB10 } from './SafetyPanelB10';
import { GuidePanelB10 } from './GuidePanelB10';
import { DebugPanelB10 } from './DebugPanelB10';
import { InstrumentsBarB10 } from './InstrumentsBarB10';
import { ToastsB10 } from './ui';
import { DemoPanelB10 } from './demo/DemoPanelB10';
import { EyepiecePanelB10 } from './EyepiecePanelB10';
import { BenchPanelB10 } from './BenchPanelB10';
import { AnatomyPanelB10 } from './AnatomyPanelB10';

function ZoomControlsB10() {
  const { t } = useTranslation();
  const stage = useB10((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    const sel = useB10.getState().selected;
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
      <button className="btn small" aria-label={t('b10.cam.eye')} title={`${t('b10.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreenB10() {
  const { t } = useTranslation();
  const notebookOpen = useB10((s) => s.notebookOpen);
  const inventoryOpen = useB10((s) => s.inventoryOpen);
  const mode = useB10((s) => s.settings.mode);
  const paused = useB10((s) => s.paused);
  const demo = useB10((s) => !!s.demo);
  return (
    <div className="lab lab-b10">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudB10 />
      <div className="lab-main">
        {inventoryOpen ? <InventoryB10 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p7 p8 p9 b10${demo ? ' demo' : ''}`}>
          <LabCanvasB10 />
          <InstrumentsBarB10 />
          <div className="model-badge" role="note">{t('b10.modelBadge')}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelB10 />}
          {!demo && mode === 'GUIDED' && <GuidePanelB10 />}
          {!demo && mode === 'DEBUG' && <DebugPanelB10 />}
          <SafetyPanelB10 />
          <EyepiecePanelB10 />
          <BenchPanelB10 />
          <AnatomyPanelB10 />
          <ZoomControlsB10 />
          <ToastsB10 />
          <SafetyBannerB10 />
        </div>
        {notebookOpen ? <NotebookPanelB10 /> : <div />}
      </div>
      <ActionPanelB10 />
      <DialogsB10 />
    </div>
  );
}
