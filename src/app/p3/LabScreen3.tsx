import { useTranslation } from 'react-i18next';
import { useP3 } from './store';
import { Hud3 } from './Hud3';
import { LabCanvas3 } from './LabCanvas3';
import { ActionPanel3 } from './ActionPanel3';
import { Inventory3 } from './Inventory3';
import { NotebookPanel3 } from './NotebookPanel3';
import { Dialogs3 } from './Dialogs3';
import { SafetyBanner3, SafetyPanel3 } from './SafetyPanel3';
import { GuidePanel3 } from './GuidePanel3';
import { DebugPanel3 } from './DebugPanel3';
import { PartsPanel3 } from './PartsPanel3';
import { Toasts3 } from './ui';
import { DemoPanel3 } from './demo/DemoPanel3';

function ZoomControls3() {
  const { t } = useTranslation();
  const stage = useP3((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreen3() {
  const { t } = useTranslation();
  const notebookOpen = useP3((s) => s.notebookOpen);
  const inventoryOpen = useP3((s) => s.inventoryOpen);
  const partsOpen = useP3((s) => s.partsOpen);
  const mode = useP3((s) => s.settings.mode);
  const paused = useP3((s) => s.paused);
  const demo = useP3((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <Hud3 />
      <div className="lab-main">
        {inventoryOpen ? <Inventory3 /> : <div />}
        <div className={`canvas-wrap p3${demo ? ' demo' : ''}`}>
          <LabCanvas3 />
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanel3 />}
          {partsOpen ? <PartsPanel3 /> : !demo && mode === 'GUIDED' ? <GuidePanel3 /> : null}
          {!demo && mode === 'DEBUG' && <DebugPanel3 />}
          <SafetyPanel3 />
          <ZoomControls3 />
          <Toasts3 />
          <SafetyBanner3 />
        </div>
        {notebookOpen ? <NotebookPanel3 /> : <div />}
      </div>
      <ActionPanel3 />
      <Dialogs3 />
    </div>
  );
}
