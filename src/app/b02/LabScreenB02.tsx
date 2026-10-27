import { useTranslation } from 'react-i18next';
import { useB02 } from './store';
import { HudB02 } from './HudB02';
import { LabCanvasB02 } from './LabCanvasB02';
import { ActionPanelB02 } from './ActionPanelB02';
import { InventoryB02 } from './InventoryB02';
import { NotebookPanelB02 } from './NotebookPanelB02';
import { DialogsB02 } from './DialogsB02';
import { SafetyBannerB02, SafetyPanelB02 } from './SafetyPanelB02';
import { GuidePanelB02 } from './GuidePanelB02';
import { DebugPanelB02 } from './DebugPanelB02';
import { InstrumentsBarB02 } from './InstrumentsBarB02';
import { ToastsB02 } from './ui';
import { DemoPanelB02 } from './demo/DemoPanelB02';
import { EyepiecePanelB02 } from './EyepiecePanelB02';

function ZoomControlsB02() {
  const { t } = useTranslation();
  const stage = useB02((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    const sel = useB02.getState().selected;
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
      <button className="btn small" aria-label={t('b02.cam.eye')} title={`${t('b02.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreenB02() {
  const { t } = useTranslation();
  const notebookOpen = useB02((s) => s.notebookOpen);
  const inventoryOpen = useB02((s) => s.inventoryOpen);
  const mode = useB02((s) => s.settings.mode);
  const paused = useB02((s) => s.paused);
  const demo = useB02((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudB02 />
      <div className="lab-main">
        {inventoryOpen ? <InventoryB02 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p7 p8 b02${demo ? ' demo' : ''}`}>
          <LabCanvasB02 />
          <InstrumentsBarB02 />
          <div className="model-badge" role="note">{t('b02.modelBadge')}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelB02 />}
          {!demo && mode === 'GUIDED' && <GuidePanelB02 />}
          {!demo && mode === 'DEBUG' && <DebugPanelB02 />}
          <SafetyPanelB02 />
          <EyepiecePanelB02 />
          <ZoomControlsB02 />
          <ToastsB02 />
          <SafetyBannerB02 />
        </div>
        {notebookOpen ? <NotebookPanelB02 /> : <div />}
      </div>
      <ActionPanelB02 />
      <DialogsB02 />
    </div>
  );
}
