import { useTranslation } from 'react-i18next';
import { useP10 } from './store';
import { Hud10 } from './Hud10';
import { LabCanvas10 } from './LabCanvas10';
import { ActionPanel10 } from './ActionPanel10';
import { Inventory10 } from './Inventory10';
import { NotebookPanel10 } from './NotebookPanel10';
import { Dialogs10 } from './Dialogs10';
import { SafetyBanner10, SafetyPanel10 } from './SafetyPanel10';
import { GuidePanel10 } from './GuidePanel10';
import { DebugPanel10 } from './DebugPanel10';
import { InstrumentsBar10 } from './InstrumentsBar10';
import { Toasts10 } from './ui';
import { DemoPanel10 } from './demo/DemoPanel10';

function ZoomControls10() {
  const { t } = useTranslation();
  const stage = useP10((s) => s.stage);
  const cam = () => stage?.camera;
  const eye = () => {
    const sel = useP10.getState().selected;
    cam()?.eyeLevel(sel === 'cylinder' || sel === 'flask' || sel === 'pipette' || sel === 'ruler' ? sel : sel === 'abalance' ? 'balance' : 'burette');
  };
  return (
    <div className="zoom-ctrl" role="group" aria-label={t('cam.title')}>
      <button className="btn small" aria-label={t('cam.left')} title={`${t('cam.left')} (J)`} onClick={() => cam()?.orbit(0.3, 0)}>⟲</button>
      <button className="btn small" aria-label={t('cam.right')} title={`${t('cam.right')} (L)`} onClick={() => cam()?.orbit(-0.3, 0)}>⟳</button>
      <button className="btn small" aria-label={t('cam.up')} title={`${t('cam.up')} (I)`} onClick={() => cam()?.orbit(0, -0.15)}>▲</button>
      <button className="btn small" aria-label={t('cam.down')} title={`${t('cam.down')} (K)`} onClick={() => cam()?.orbit(0, 0.15)}>▼</button>
      <button className="btn small" aria-label={t('hud.zoomIn')} title={`${t('hud.zoomIn')} (+)`} onClick={() => cam()?.zoomBy(1.25)}>＋</button>
      <button className="btn small" aria-label={t('hud.zoomOut')} title={`${t('hud.zoomOut')} (−)`} onClick={() => cam()?.zoomBy(0.8)}>－</button>
      <button className="btn small" aria-label={t('p10.cam.eye')} title={`${t('p10.cam.eye')} (O)`} onClick={eye}>👁</button>
      <button className="btn small" aria-label={t('cam.reset')} title={`${t('cam.reset')} (0)`} onClick={() => cam()?.reset()}>⌂</button>
    </div>
  );
}

export function LabScreen10() {
  const { t } = useTranslation();
  const notebookOpen = useP10((s) => s.notebookOpen);
  const inventoryOpen = useP10((s) => s.inventoryOpen);
  const mode = useP10((s) => s.settings.mode);
  const model = useP10((s) => s.settings.model);
  const paused = useP10((s) => s.paused);
  const demo = useP10((s) => !!s.demo);
  return (
    <div className="lab">
      <a href="#actions" className="sr-only">{t('a11y.skip')}</a>
      <Hud10 />
      <div className="lab-main">
        {inventoryOpen ? <Inventory10 /> : <div />}
        <div className={`canvas-wrap p3 p4 p5 p6 p10${demo ? ' demo' : ''}`}>
          <LabCanvas10 />
          <InstrumentsBar10 />
          <div className="model-badge" role="note">{t(`p10.modelBadge.${model}`)}</div>
          {paused && !demo && <div className="paused-badge" role="status">{t('hud.paused')}</div>}
          {demo && <DemoPanel10 />}
          {!demo && mode === 'GUIDED' && <GuidePanel10 />}
          {!demo && mode === 'DEBUG' && <DebugPanel10 />}
          <SafetyPanel10 />
          <ZoomControls10 />
          <Toasts10 />
          <SafetyBanner10 />
        </div>
        {notebookOpen ? <NotebookPanel10 /> : <div />}
      </div>
      <ActionPanel10 />
      <Dialogs10 />
    </div>
  );
}
