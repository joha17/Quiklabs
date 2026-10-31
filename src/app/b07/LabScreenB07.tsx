import { useTranslation } from 'react-i18next';
import { useB07 } from './store';
import { HudB07 } from './HudB07';
import { LabCanvasB07 } from './LabCanvasB07';
import { ActionPanelB07 } from './ActionPanelB07';
import { InventoryB07 } from './InventoryB07';
import { NotebookPanelB07 } from './NotebookPanelB07';
import { DialogsB07 } from './DialogsB07';
import { SafetyBannerB07, SafetyPanelB07 } from './SafetyPanelB07';
import { GuidePanelB07 } from './GuidePanelB07';
import { DebugPanelB07 } from './DebugPanelB07';
import { InstrumentsBarB07 } from './InstrumentsBarB07';
import { ToastsB07 } from './ui';
import { DemoPanelB07 } from './demo/DemoPanelB07';
import { EyepiecePanelB07 } from './EyepiecePanelB07';
import { BenchPanelB07 } from './BenchPanelB07';

function ZoomControlsB07() {
  const { t } = useTranslation();
  const stage = useB07((s) => s.stage);
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
      <button className="btn small" aria-label={t('b07.cam.eye')} title={`${t('b07.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreenB07() {
  const { t } = useTranslation();
  const notebookOpen = useB07((s) => s.notebookOpen);
  const inventoryOpen = useB07((s) => s.inventoryOpen);
  const mode = useB07((s) => s.settings.mode);
  const paused = useB07((s) => s.paused);
  const demo = useB07((s) => !!s.demo);
  return (
    <div className="lab lab-b07">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudB07 />
      <div className="lab-main">
        {inventoryOpen ? <InventoryB07 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p7 p8 b07${demo ? ' demo' : ''}`}>
          <LabCanvasB07 />
          <InstrumentsBarB07 />
          <div className="model-badge" role="note">{t('b07.modelBadge')}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelB07 />}
          {!demo && mode === 'GUIDED' && <GuidePanelB07 />}
          {!demo && mode === 'DEBUG' && <DebugPanelB07 />}
          <SafetyPanelB07 />
          <EyepiecePanelB07 />
          <BenchPanelB07 />
          <ZoomControlsB07 />
          <ToastsB07 />
          <SafetyBannerB07 />
        </div>
        {notebookOpen ? <NotebookPanelB07 /> : <div />}
      </div>
      <ActionPanelB07 />
      <DialogsB07 />
    </div>
  );
}
