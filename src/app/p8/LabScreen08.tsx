import { useTranslation } from 'react-i18next';
import { useP08 } from './store';
import { Hud08 } from './Hud08';
import { LabCanvas08 } from './LabCanvas08';
import { ActionPanel08 } from './ActionPanel08';
import { Inventory08 } from './Inventory08';
import { NotebookPanel08 } from './NotebookPanel08';
import { Dialogs08 } from './Dialogs08';
import { SafetyBanner08, SafetyPanel08 } from './SafetyPanel08';
import { GuidePanel08 } from './GuidePanel08';
import { DebugPanel08 } from './DebugPanel08';
import { InstrumentsBar08 } from './InstrumentsBar08';
import { Toasts08 } from './ui';
import { DemoPanel08 } from './demo/DemoPanel08';

function ZoomControls08() {
  const { t } = useTranslation();
  const stage = useP08((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    const sel = useP08.getState().selected;
    cam()?.eyeLevel(sel ?? 'cyl10');
  };
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('p8.cam.eye')} title={`${t('p8.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreen08() {
  const { t } = useTranslation();
  const notebookOpen = useP08((s) => s.notebookOpen);
  const inventoryOpen = useP08((s) => s.inventoryOpen);
  const mode = useP08((s) => s.settings.mode);
  const paused = useP08((s) => s.paused);
  const demo = useP08((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <Hud08 />
      <div className="lab-main">
        {inventoryOpen ? <Inventory08 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p7 p8${demo ? ' demo' : ''}`}>
          <LabCanvas08 />
          <InstrumentsBar08 />
          <div className="model-badge" role="note">{t('p8.modelBadge')}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanel08 />}
          {!demo && mode === 'GUIDED' && <GuidePanel08 />}
          {!demo && mode === 'DEBUG' && <DebugPanel08 />}
          <SafetyPanel08 />
          <ZoomControls08 />
          <Toasts08 />
          <SafetyBanner08 />
        </div>
        {notebookOpen ? <NotebookPanel08 /> : <div />}
      </div>
      <ActionPanel08 />
      <Dialogs08 />
    </div>
  );
}
