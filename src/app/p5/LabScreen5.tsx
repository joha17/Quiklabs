import { useTranslation } from 'react-i18next';
import { useP5 } from './store';
import { Hud5 } from './Hud5';
import { LabCanvas5 } from './LabCanvas5';
import { ActionPanel5 } from './ActionPanel5';
import { Inventory5 } from './Inventory5';
import { NotebookPanel5 } from './NotebookPanel5';
import { Dialogs5 } from './Dialogs5';
import { SafetyBanner5, SafetyPanel5 } from './SafetyPanel5';
import { GuidePanel5 } from './GuidePanel5';
import { DebugPanel5 } from './DebugPanel5';
import { BalanceLens } from './BalanceLens';
import { Toasts5 } from './ui';
import { DemoPanel5 } from './demo/DemoPanel5';

function ZoomControls5() {
  const { t } = useTranslation();
  const stage = useP5((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('p5.cam.eye')} title={`${t('p5.cam.eye')} (V)`} onClick={() => cam()?.eyeLevel()}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreen5() {
  const { t } = useTranslation();
  const notebookOpen = useP5((s) => s.notebookOpen);
  const inventoryOpen = useP5((s) => s.inventoryOpen);
  const mode = useP5((s) => s.settings.mode);
  const paused = useP5((s) => s.paused);
  const demo = useP5((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <Hud5 />
      <div className="lab-main">
        {inventoryOpen ? <Inventory5 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5${demo ? ' demo' : ''}`}>
          <LabCanvas5 />
          <BalanceLens />
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanel5 />}
          {!demo && mode === 'GUIDED' && <GuidePanel5 />}
          {!demo && mode === 'DEBUG' && <DebugPanel5 />}
          <SafetyPanel5 />
          <ZoomControls5 />
          <Toasts5 />
          <SafetyBanner5 />
        </div>
        {notebookOpen ? <NotebookPanel5 /> : <div />}
      </div>
      <ActionPanel5 />
      <Dialogs5 />
    </div>
  );
}
