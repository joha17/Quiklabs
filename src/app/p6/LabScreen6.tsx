import { useTranslation } from 'react-i18next';
import { useP6 } from './store';
import { Hud6 } from './Hud6';
import { LabCanvas6 } from './LabCanvas6';
import { ActionPanel6 } from './ActionPanel6';
import { Inventory6 } from './Inventory6';
import { NotebookPanel6 } from './NotebookPanel6';
import { Dialogs6 } from './Dialogs6';
import { SafetyBanner6, SafetyPanel6 } from './SafetyPanel6';
import { GuidePanel6 } from './GuidePanel6';
import { DebugPanel6 } from './DebugPanel6';
import { BalanceLens6 } from './BalanceLens6';
import { InstrumentsBar } from './InstrumentsBar';
import { Toasts6 } from './ui';
import { DemoPanel6 } from './demo/DemoPanel6';

function ZoomControls6() {
  const { t } = useTranslation();
  const stage = useP6((s) => s.stage);
  const cam = () => stage?.camera;
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('p6.cam.eye')} title={`${t('p6.cam.eye')} (V)`} onClick={() => cam()?.eyeLevel(useP6.getState().selected === 'balance' ? 'balance' : 'cylinder')}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreen6() {
  const { t } = useTranslation();
  const notebookOpen = useP6((s) => s.notebookOpen);
  const inventoryOpen = useP6((s) => s.inventoryOpen);
  const mode = useP6((s) => s.settings.mode);
  const paused = useP6((s) => s.paused);
  const demo = useP6((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <Hud6 />
      <div className="lab-main">
        {inventoryOpen ? <Inventory6 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6${demo ? ' demo' : ''}`}>
          <LabCanvas6 />
          <BalanceLens6 />
          <InstrumentsBar />
          {useP6.getState().settings.model === 'IDEAL' && <div className="model-badge" role="note">{t('p6.idealBadge')}</div>}
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanel6 />}
          {!demo && mode === 'GUIDED' && <GuidePanel6 />}
          {!demo && mode === 'DEBUG' && <DebugPanel6 />}
          <SafetyPanel6 />
          <ZoomControls6 />
          <Toasts6 />
          <SafetyBanner6 />
        </div>
        {notebookOpen ? <NotebookPanel6 /> : <div />}
      </div>
      <ActionPanel6 />
      <Dialogs6 />
    </div>
  );
}
