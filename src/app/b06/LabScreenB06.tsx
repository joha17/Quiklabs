import { useTranslation } from 'react-i18next';
import { useB06 } from './store';
import { HudB06 } from './HudB06';
import { LabCanvasB06 } from './LabCanvasB06';
import { ActionPanelB06 } from './ActionPanelB06';
import { InventoryB06 } from './InventoryB06';
import { NotebookPanelB06 } from './NotebookPanelB06';
import { DialogsB06 } from './DialogsB06';
import { SafetyBannerB06, SafetyPanelB06 } from './SafetyPanelB06';
import { GuidePanelB06 } from './GuidePanelB06';
import { DebugPanelB06 } from './DebugPanelB06';
import { InstrumentsBarB06 } from './InstrumentsBarB06';
import { ToastsB06 } from './ui';
import { DemoPanelB06 } from './demo/DemoPanelB06';
import { EyepiecePanelB06 } from './EyepiecePanelB06';

function ZoomControlsB06() {
  const { t } = useTranslation();
  const stage = useB06((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    const sel = useB06.getState().selected;
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
      <button className="btn small" aria-label={t('b06.cam.eye')} title={`${t('b06.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreenB06() {
  const { t } = useTranslation();
  const notebookOpen = useB06((s) => s.notebookOpen);
  const inventoryOpen = useB06((s) => s.inventoryOpen);
  const mode = useB06((s) => s.settings.mode);
  const paused = useB06((s) => s.paused);
  const demo = useB06((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <HudB06 />
      <div className="lab-main">
        {inventoryOpen ? <InventoryB06 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p7 p8 b06${demo ? ' demo' : ''}`}>
          <LabCanvasB06 />
          <InstrumentsBarB06 />
          <div className="model-badge" role="note">{t('b06.modelBadge')}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanelB06 />}
          {!demo && mode === 'GUIDED' && <GuidePanelB06 />}
          {!demo && mode === 'DEBUG' && <DebugPanelB06 />}
          <SafetyPanelB06 />
          <EyepiecePanelB06 />
          <ZoomControlsB06 />
          <ToastsB06 />
          <SafetyBannerB06 />
        </div>
        {notebookOpen ? <NotebookPanelB06 /> : <div />}
      </div>
      <ActionPanelB06 />
      <DialogsB06 />
    </div>
  );
}
