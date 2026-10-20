import { useTranslation } from 'react-i18next';
import { useP07 } from './store';
import { Hud07 } from './Hud07';
import { LabCanvas07 } from './LabCanvas07';
import { ActionPanel07 } from './ActionPanel07';
import { Inventory07 } from './Inventory07';
import { NotebookPanel07 } from './NotebookPanel07';
import { Dialogs07 } from './Dialogs07';
import { SafetyBanner07, SafetyPanel07 } from './SafetyPanel07';
import { GuidePanel07 } from './GuidePanel07';
import { DebugPanel07 } from './DebugPanel07';
import { InstrumentsBar07 } from './InstrumentsBar07';
import { Toasts07 } from './ui';
import { DemoPanel07 } from './demo/DemoPanel07';

function ZoomControls07() {
  const { t } = useTranslation();
  const stage = useP07((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    const sel = useP07.getState().selected;
    cam()?.eyeLevel(sel === 'pipette25' || sel === 'thermometer07' || sel === 'caliper07' ? sel : sel === 'balance07' ? 'balance' : 'cylinder50');
  };
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('p7.cam.eye')} title={`${t('p7.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreen07() {
  const { t } = useTranslation();
  const notebookOpen = useP07((s) => s.notebookOpen);
  const inventoryOpen = useP07((s) => s.inventoryOpen);
  const mode = useP07((s) => s.settings.mode);
  const paused = useP07((s) => s.paused);
  const demo = useP07((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <Hud07 />
      <div className="lab-main">
        {inventoryOpen ? <Inventory07 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10 p7${demo ? ' demo' : ''}`}>
          <LabCanvas07 />
          <InstrumentsBar07 />
          <div className="model-badge" role="note">{t('p7.modelBadge')}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanel07 />}
          {!demo && mode === 'GUIDED' && <GuidePanel07 />}
          {!demo && mode === 'DEBUG' && <DebugPanel07 />}
          <SafetyPanel07 />
          <ZoomControls07 />
          <Toasts07 />
          <SafetyBanner07 />
        </div>
        {notebookOpen ? <NotebookPanel07 /> : <div />}
      </div>
      <ActionPanel07 />
      <Dialogs07 />
    </div>
  );
}
